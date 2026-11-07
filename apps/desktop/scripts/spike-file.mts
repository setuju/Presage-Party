import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SmartSpectraSDK, ProcessingStatus, SmartSpectraErrorCode,
  SmartSpectraLogLevel, decodeMetrics, breathingMetrics, faceMetrics,
} from '@smartspectra/node-sdk';

const TIMEOUT_MS = Number(process.env.SPIKE_TIMEOUT_MS ?? '240000');
const INTERFRAME_DELAY_MS = Number(process.env.INTERFRAME_DELAY_MS ?? '33');
const METRICS_DRAIN_MS = 300;
const SNAPSHOT_AT = new Set([400, 800, 1200, 1600]);

try {
  const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env */ }

function statusName(n: number): string {
  const m: Record<number, string> = {0:'kUninit',1:'kIdle',2:'kStarting',3:'kRunning',4:'kStopping',5:'kError'};
  return m[n] ?? `k?(${n})`;
}

async function main(): Promise<void> {
  const apiKey = process.env.SMARTSPECTRA_API_KEY?.trim();
  const videoPath = process.argv[2];
  if (!apiKey || !videoPath) { console.error('[spike] FAIL: usage'); process.exitCode = 10; return; }

  console.log('[spike] config: metrics=BREATHING+FACE (no cardio), interframeDelayMs=' + INTERFRAME_DELAY_MS);
  console.log('[spike] requested breathing codes: ' + JSON.stringify(breathingMetrics));
  console.log('[spike] requested face codes:      ' + JSON.stringify(faceMetrics));

  const sdk = new SmartSpectraSDK({
    apiKey, enableTelemetry: false, logLevel: SmartSpectraLogLevel.kInfo,
    requestedMetrics: [...breathingMetrics, ...faceMetrics],
  });

  let metricsCount = 0, errorCount = 0, lastStatus = -1;
  const startedAt = Date.now();
  const validationCounts = new Map<number, number>();

  sdk.on('error', (code, message, retryable) => {
    errorCount++;
    console.error(`[sdk:error] t=${Date.now()-startedAt}ms code=${code} retryable=${retryable} msg=${JSON.stringify(message)}`);
  });
  sdk.on('validationStatus', (code) => validationCounts.set(code, (validationCounts.get(code) ?? 0) + 1));
  sdk.on('metrics', (buf, ts) => {
    metricsCount++;
    let d: any;
    try { d = decodeMetrics(buf); } catch (e) { console.error('[sdk:metrics] decode failed: ' + (e as Error).message); return; }
    if (SNAPSHOT_AT.has(metricsCount)) {
      const printable = d?.toJSON?.() ?? d;
      console.log(`[sdk:metrics] SNAPSHOT #${metricsCount} ts=${ts}:`);
      console.log(JSON.stringify(printable, null, 2));
      console.log('[sdk:metrics] (end snapshot)');
    }
    if (metricsCount % 100 === 0) console.log(`[sdk:metrics] #${metricsCount} ts=${ts}`);
  });

  sdk.useFile(videoPath, { interframeDelayMs: INTERFRAME_DELAY_MS });
  sdk.start();

  let sawNonIdle = false;
  let exitReason: 'idle'|'error'|'timeout' = 'timeout';
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise<void>((r) => setImmediate(r));
    const st = sdk.processingStatus;
    if (st !== lastStatus) { console.log(`[spike:poll] ${statusName(st)} (${st}) t=${Date.now()-startedAt}ms`); lastStatus = st; }
    if (st !== ProcessingStatus.kIdle) sawNonIdle = true;
    if (st === ProcessingStatus.kError) { exitReason = 'error'; break; }
    if (sawNonIdle && st === ProcessingStatus.kIdle) { exitReason = 'idle'; break; }
  }

  await new Promise<void>((r) => setTimeout(r, METRICS_DRAIN_MS));
  await sdk.destroy();

  console.log('');
  console.log('[spike] SUMMARY');
  console.log('  exitReason =', exitReason);
  console.log('  metrics    =', metricsCount);
  console.log('  errors     =', errorCount);
  console.log('  elapsed_ms =', Date.now() - startedAt);
  console.log('  validation =', Object.fromEntries(validationCounts));

  if (exitReason === 'error' || errorCount > 0) { process.exitCode = 3; return; }
  if (exitReason === 'timeout') { process.exitCode = 2; return; }
  process.exitCode = 0;
}

main().catch((e) => { console.error('[spike] unhandled:', e); process.exitCode = 1; });
