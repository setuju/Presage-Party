/**
 * Phase 0a — headless useFile() spike.
 *
 * Proves: @smartspectra/node-sdk loads in pure Node 24 (no Electron),
 * authenticates with the API key, runs the file playback pipeline,
 * decodes metrics (if any), and shuts down cleanly.
 *
 * Does NOT need a camera. Does NOT need Electron. Works on WSL2.
 *
 * Usage:
 *   SMARTSPECTRA_API_KEY=... pnpm --filter @presage-party/desktop \
 *     exec tsx scripts/spike-file.mts fixtures/testsrc.mp4
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

// Best-effort .env loader; does not override existing env vars.
try {
  const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  /* no .env, rely on process.env */
}

function statusName(n: number): string {
  const m: Record<number, string> = {
    [ProcessingStatus.kUninitialized]: 'kUninitialized',
    [ProcessingStatus.kIdle]: 'kIdle',
    [ProcessingStatus.kStarting]: 'kStarting',
    [ProcessingStatus.kRunning]: 'kRunning',
    [ProcessingStatus.kStopping]: 'kStopping',
    [ProcessingStatus.kError]: 'kError',
  };
  return m[n] ?? `kUnknown(${n})`;
}

function errorName(n: number): string {
  const m: Record<number, string> = {
    [SmartSpectraErrorCode.kOk]: 'kOk',
    [SmartSpectraErrorCode.kInvalidState]: 'kInvalidState',
    [SmartSpectraErrorCode.kAuthenticationFailed]: 'kAuthenticationFailed',
    [SmartSpectraErrorCode.kConfigurationFailed]: 'kConfigurationFailed',
    [SmartSpectraErrorCode.kCreditExhausted]: 'kCreditExhausted',
    [SmartSpectraErrorCode.kNetworkError]: 'kNetworkError',
  };
  return m[n] ?? `code_${n}`;
}

async function main(): Promise<void> {
  const apiKey = process.env.SMARTSPECTRA_API_KEY?.trim();
  const videoPath = process.argv[2];

  if (!apiKey) {
    console.error('[spike] FAIL: SMARTSPECTRA_API_KEY not set (env or apps/desktop/.env)');
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
    enableTelemetry: false, // hard rule — SYSTEM_PROMPT.md §5
    logLevel: SmartSpectraLogLevel.kInfo,
  });

  let metricsCount = 0;
  let firstMetricsDumped = false;
  let errorCount = 0;
  let lastStatus = -1;
  let hasBeenRunning = false;

  sdk.on('processingStatus', (status) => {
    if (status === ProcessingStatus.kRunning) hasBeenRunning = true;
    if (status !== lastStatus) {
      console.log(`[sdk:status] ${statusName(status)} (${status})`);
      lastStatus = status;
    }
  });

  sdk.on('validationStatus', (code, ts, hint) => {
    console.log(`[sdk:validation] code=${code} ts=${ts} hint=${JSON.stringify(hint)}`);
  });

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

  const settled = await new Promise<boolean>((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(false), TIMEOUT_MS);
    sdk.on('processingStatus', (status) => {
      if (hasBeenRunning && status === ProcessingStatus.kIdle) {
        clearTimeout(timer);
        resolvePromise(true);
      }
      if (status === ProcessingStatus.kError) {
        clearTimeout(timer);
        resolvePromise(false);
      }
    });
  });

  console.log(`[spike] settled=${settled} metrics=${metricsCount} errors=${errorCount}`);

  await sdk.destroy();
  console.log('[spike] destroyed cleanly');

  if (!settled) {
    console.error(`[spike] TIMEOUT after ${TIMEOUT_MS} ms (pipeline never reached kIdle)`);
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
