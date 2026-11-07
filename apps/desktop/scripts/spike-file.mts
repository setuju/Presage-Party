/**
 * Phase 0a — headless useFile() spike.
 *
 * Proves: @smartspectra/node-sdk loads in pure Node 24 (no Electron),
 * authenticates with the API key, runs the file playback pipeline,
 * decodes metrics (if any), and shuts down cleanly.
 *
 * Empirical finding (2026-11-07, SDK 3.4.0):
 *   `processingStatus` JS event does NOT reliably emit kRunning or the
 *   terminal kIdle transition for file playback. `waitUntilComplete()` is
 *   documented but blocks the JS event loop, preventing metrics callbacks
 *   from firing during the block. Therefore we poll `sdk.processingStatus`
 *   in a setImmediate loop, and fall back to waitUntilComplete() only if
 *   polling never leaves kIdle within 30 s.
 *
 * Usage:
 *   SMARTSPECTRA_API_KEY=... pnpm --filter @presage-party/desktop \
 *     exec tsx scripts/spike-file.mts fixtures/face.mp4
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SmartSpectraSDK,
  ProcessingStatus,
  SmartSpectraErrorCode,
  SmartSpectraLogLevel,
  decodeMetrics,
} from '@smartspectra/node-sdk';

const TIMEOUT_MS = 180_000;
const POLL_FALLBACK_AFTER_MS = 30_000;
const METRICS_DRAIN_MS = 100;

try {
  const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  /* no .env */
}

function statusName(n: number): string {
  const map: Record<number, string> = {
    [ProcessingStatus.kUninitialized]: 'kUninitialized',
    [ProcessingStatus.kIdle]: 'kIdle',
    [ProcessingStatus.kStarting]: 'kStarting',
    [ProcessingStatus.kRunning]: 'kRunning',
    [ProcessingStatus.kStopping]: 'kStopping',
    [ProcessingStatus.kError]: 'kError',
  };
  return map[n] ?? `kUnknown(${n})`;
}

function errorName(n: number): string {
  const map: Record<number, string> = {
    [SmartSpectraErrorCode.kOk]: 'kOk',
    [SmartSpectraErrorCode.kInvalidState]: 'kInvalidState',
    [SmartSpectraErrorCode.kAuthenticationFailed]: 'kAuthenticationFailed',
    [SmartSpectraErrorCode.kConfigurationFailed]: 'kConfigurationFailed',
    [SmartSpectraErrorCode.kCreditExhausted]: 'kCreditExhausted',
    [SmartSpectraErrorCode.kNetworkError]: 'kNetworkError',
  };
  return map[n] ?? `code_${n}`;
}

async function main(): Promise<void> {
  const apiKey = process.env.SMARTSPECTRA_API_KEY?.trim();
  const videoPath = process.argv[2];

  if (!apiKey) {
    console.error('[spike] FAIL: SMARTSPECTRA_API_KEY not set');
    process.exitCode = 10;
    return;
  }
  if (!videoPath) {
    console.error('[spike] FAIL: usage — tsx scripts/spike-file.mts <video.mp4>');
    process.exitCode = 11;
    return;
  }

  console.log('[spike] sdk version:', SmartSpectraSDK.version);
  console.log('[spike] video:', videoPath);
  console.log('[spike] config: enableTelemetry=false, logLevel=kInfo');

  const sdk = new SmartSpectraSDK({
    apiKey,
    enableTelemetry: false,
    logLevel: SmartSpectraLogLevel.kInfo,
  });

  let metricsCount = 0;
  let firstMetricsDumped = false;
  let errorCount = 0;

  sdk.on('error', (code, message, retryable) => {
    errorCount++;
    console.error(
      `[sdk:error] code=${code} (${errorName(code)}) retryable=${retryable} message=${JSON.stringify(message)}`,
    );
  });

  sdk.on('metrics', (buf, ts) => {
    metricsCount++;
    let decoded: unknown;
    try {
      decoded = decodeMetrics(buf);
    } catch (err) {
      console.error(`[sdk:metrics] decode failed: ${(err as Error).message}`);
      return;
    }
    if (!firstMetricsDumped) {
      firstMetricsDumped = true;
      console.log('[sdk:metrics] FIRST PACKET — full decoded shape:');
      try {
        const printable = (decoded as any)?.toJSON?.() ?? decoded;
        console.log(JSON.stringify(printable, null, 2));
      } catch {
        console.log(String(decoded));
      }
      console.log('[sdk:metrics] (further packets logged every 10th)');
      return;
    }
    if (metricsCount % 10 === 0) {
      console.log(`[sdk:metrics] #${metricsCount} ts=${ts}`);
    }
  });

  sdk.useFile(videoPath, { interframeDelayMs: 33 });
  console.log('[spike] starting file playback...');
  sdk.start();

  const startedAt = Date.now();
  let settled = false;
  let sawNonIdle = false;
  let lastPolledStatus = -1;
  let usedFallback = false;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise<void>((r) => setImmediate(r));

    const st = sdk.processingStatus;
    if (st !== lastPolledStatus) {
      console.log(
        `[spike:poll] status=${statusName(st)} (${st}) t=${Date.now() - startedAt}ms`,
      );
      lastPolledStatus = st;
    }
    if (st !== ProcessingStatus.kIdle) sawNonIdle = true;
    if (st === ProcessingStatus.kError) break;
    if (sawNonIdle && st === ProcessingStatus.kIdle) {
      settled = true;
      break;
    }

    if (!sawNonIdle && Date.now() - startedAt > POLL_FALLBACK_AFTER_MS) {
      console.log(
        '[spike:poll] never saw non-idle; falling back to waitUntilComplete()',
      );
      usedFallback = true;
      const remaining = TIMEOUT_MS - (Date.now() - startedAt);
      settled = sdk.waitUntilComplete(remaining);
      break;
    }
  }

  await new Promise<void>((r) => setTimeout(r, METRICS_DRAIN_MS));

  await sdk.destroy();
  console.log(
    `[spike] destroyed. settled=${settled} fallback=${usedFallback} metrics=${metricsCount} errors=${errorCount}`,
  );

  if (!settled) {
    console.error(`[spike] TIMEOUT after ${TIMEOUT_MS} ms`);
    process.exitCode = 2;
    return;
  }
  if (errorCount > 0) {
    console.error(`[spike] completed with ${errorCount} SDK error(s)`);
    process.exitCode = 3;
    return;
  }
  if (metricsCount === 0) {
    console.log('[spike] OK — pipeline ran end-to-end with ZERO metrics (expected for non-face video)');
    process.exitCode = 0;
    return;
  }
  console.log(`[spike] OK — ${metricsCount} metrics events`);
  process.exitCode = 0;
}

main().catch((err) => {
  console.error('[spike] unhandled:', err);
  process.exitCode = 1;
});
