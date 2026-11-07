import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SmartSpectraSDK, ProcessingStatus, SmartSpectraLogLevel,
  decodeMetrics, breathingMetrics, faceMetrics,
} from '@smartspectra/node-sdk';

const TIMEOUT_MS = Number(process.env.SPIKE_TIMEOUT_MS ?? '240000');
const INTERFRAME_DELAY_MS = Number(process.env.INTERFRAME_DELAY_MS ?? '33');
const METRICS_DRAIN_MS = 500;

try {
  const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env */ }

function statusName(n: number): string {
  return (['kUninit','kIdle','kStarting','kRunning','kStopping','kError'] as const)[n] ?? `k?(${n})`;
}

function scrubLandmarks(obj: any): any {
  if (obj?.face?.landmarks) {
    for (const lm of obj.face.landmarks) {
      if (Array.isArray(lm?.value)) lm.value = `[${lm.value.length} points]`;
    }
  }
  return obj;
}

async function main(): Promise<void> {
  const apiKey = process.env.SMARTSPECTRA_API_KEY?.trim();
  const videoPath = process.argv[2];
  if (!apiKey || !videoPath) { console.error('[spike] FAIL: usage'); process.exitCode = 10; return; }

  console.log('[spike] config: BREATHING+FACE, enableAccumulatedOutput=true');

  const sdk = new SmartSpectraSDK({
    apiKey, enableTelemetry: false, logLevel: SmartSpectraLogLevel.kInfo,
    requestedMetrics: [...breathingMetrics, ...faceMetrics],
    enableAccumulatedOutput: true,
  });

  let mCount = 0, aCount = 0, eCount = 0, lastStatus = -1;
  const t0 = Date.now();
  const valCounts = new Map<number, number>();

  sdk.on('error', (code, msg, retry) => {
    eCount++;
    console.error(`[sdk:error] t=${Date.now()-t0}ms code=${code} retry=${retry} msg=${JSON.stringify(msg)}`);
  });
  sdk.on('validationStatus', (code) => valCounts.set(code, (valCounts.get(code) ?? 0) + 1));

  sdk.on('metrics', (buf, ts) => {
    mCount++;
    if (mCount % 100 === 0) {
      try {
        const d: any = decodeMetrics(buf);
        const p = scrubLandmarks(d?.toJSON?.() ?? d);
        console.log(`[sdk:metrics] #${mCount} ts=${ts}:`);
        console.log(JSON.stringify(p, null, 2));
      } catch (e) { console.error('[sdk:metrics] decode failed: ' + (e as Error).message); }
    }
  });

  sdk.on('accumulatedMetrics', (buf, ts) => {
    aCount++;
    console.log(`[sdk:accumulated] #${aCount} ts=${ts}`);
    try {
      const d: any = decodeMetrics(buf);
      const p = scrubLandmarks(d?.toJSON?.() ?? d);
      console.log(JSON.stringify(p, null, 2));
    } catch (e) { console.error('[sdk:accumulated] decode failed: ' + (e as Error).message); }
  });

  sdk.useFile(videoPath, { interframeDelayMs: INTERFRAME_DELAY_MS });
  sdk.start();

  let sawNonIdle = false;
  let exitReason: 'idle'|'error'|'timeout' = 'timeout';
  while (Date.now() - t0 < TIMEOUT_MS) {
    await new Promise<void>((r) => setImmediate(r));
    const st = sdk.processingStatus;
    if (st !== lastStatus) { console.log(`[spike:poll] ${statusName(st)} (${st}) t=${Date.now()-t0}ms`); lastStatus = st; }
    if (st !== ProcessingStatus.kIdle) sawNonIdle = true;
    if (st === ProcessingStatus.kError) { exitReason = 'error'; break; }
    if (sawNonIdle && st === ProcessingStatus.kIdle) { exitReason = 'idle'; break; }
  }

  await new Promise<void>((r) => setTimeout(r, METRICS_DRAIN_MS));
  await sdk.destroy();

  console.log('');
  console.log('[spike] SUMMARY');
  console.log('  exitReason        =', exitReason);
  console.log('  metrics           =', mCount);
  console.log('  accumulatedMetrics=', aCount);
  console.log('  errors            =', eCount);
  console.log('  elapsed_ms        =', Date.now() - t0);
  console.log('  validation        =', Object.fromEntries(valCounts));

  process.exitCode = exitReason === 'idle' && eCount === 0 ? 0 : (exitReason === 'timeout' ? 2 : 3);
}

main().catch((e) => { console.error('[spike] unhandled:', e); process.exitCode = 1; });
