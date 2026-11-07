/**
 * Phase 0a spike — v4 with JSON replay export.
 *
 * Usage:
 *   pnpm --filter @presage-party/desktop exec tsx scripts/spike-file.mts <video> [--out=<json>]
 *
 * The --out argument writes a compact timeline for replay mode:
 *   {
 *     "videoPath": "fixtures/face30.mp4",
 *     "generatedAt": "...",
 *     "sdkVersion": "3.4.0",
 *     "durationMs": 73366,
 *     "samples": [{ "t": 66666, "br": 0.17, "blink": true, "talk": false }, ...],
 *     "rates":   [{ "t": 10566666, "value": 16.90, "confidence": 36.3, "stable": false }, ...]
 *   }
 */
import { readFileSync, writeFileSync } from 'node:fs';
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

interface Sample { t: number; br: number; blink: boolean; talk: boolean; }
interface Rate   { t: number; value: number; confidence?: number; stable?: boolean; }

async function main(): Promise<void> {
  const apiKey = process.env.SMARTSPECTRA_API_KEY?.trim();
  const args = process.argv.slice(2);
  const videoPath = args.find(a => !a.startsWith('--'));
  const outPath = args.find(a => a.startsWith('--out='))?.slice(6);

  if (!apiKey) { console.error('[spike] FAIL: no API key'); process.exitCode = 10; return; }
  if (!videoPath) { console.error('[spike] FAIL: usage: <video> [--out=<json>]'); process.exitCode = 11; return; }

  console.log('[spike] config: BREATHING+FACE, enableAccumulatedOutput=true');
  console.log('[spike] output:', outPath ?? '(none)');

  const sdk = new SmartSpectraSDK({
    apiKey, enableTelemetry: false, logLevel: SmartSpectraLogLevel.kInfo,
    requestedMetrics: [...breathingMetrics, ...faceMetrics],
    enableAccumulatedOutput: true,
  });

  const samples: Sample[] = [];
  const rates: Rate[] = [];
  let mCount = 0, aCount = 0, eCount = 0, lastStatus = -1, lastTs = 0;
  const t0 = Date.now();
  const valCounts = new Map<number, number>();

  sdk.on('error', (code, msg, retry) => {
    eCount++;
    console.error(`[sdk:error] t=${Date.now()-t0}ms code=${code} retry=${retry} msg=${JSON.stringify(msg)}`);
  });
  sdk.on('validationStatus', (code) => valCounts.set(code, (valCounts.get(code) ?? 0) + 1));

  sdk.on('metrics', (buf, ts) => {
    mCount++;
    lastTs = ts;
    if (outPath) {
      try {
        const d: any = decodeMetrics(buf);
        const raw = d?.toJSON?.() ?? d;
        const br = raw?.breathing?.upperTrace?.[0]?.value;
        const blink = raw?.face?.blinking?.[0]?.stable;
        const talk  = raw?.face?.talking?.[0]?.stable;
        if (typeof br === 'number') {
          samples.push({
            t: Math.round(ts / 1000),
            br: Math.round(br * 10000) / 10000,
            blink: blink === true,
            talk:  talk === true,
          });
        }
      } catch { /* skip malformed */ }
    }
    if (mCount % 100 === 0) console.log(`[sdk:metrics] #${mCount} ts=${ts}`);
  });

  sdk.on('accumulatedMetrics', (buf, ts) => {
    aCount++;
    console.log(`[sdk:accumulated] #${aCount} ts=${ts}`);
    if (outPath) {
      try {
        const d: any = decodeMetrics(buf);
        const raw = d?.toJSON?.() ?? d;
        const rateArr = raw?.breathing?.rate ?? [];
        for (const r of rateArr) {
          if (typeof r?.value === 'number') {
            rates.push({
              t: Math.round(Number(r.timestamp) / 1000),
              value: Math.round(r.value * 100) / 100,
              confidence: typeof r.confidence === 'number' ? Math.round(r.confidence * 10) / 10 : undefined,
              stable: r.stable === true ? true : undefined,
            });
          }
        }
      } catch (e) { console.error('[sdk:accumulated] decode failed:', (e as Error).message); }
    }
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

  if (outPath) {
    const json = {
      videoPath,
      generatedAt: new Date().toISOString(),
      sdkVersion: SmartSpectraSDK.version,
      durationMs: Math.round(lastTs / 1000),
      samples,
      rates,
    };
    writeFileSync(outPath, JSON.stringify(json, null, 2));
    const bytes = JSON.stringify(json).length;
    console.log(`[spike] wrote ${outPath} (${samples.length} samples, ${rates.length} rates, ~${Math.round(bytes/1024)} KB)`);
  }

  process.exitCode = exitReason === 'idle' && eCount === 0 ? 0 : (exitReason === 'timeout' ? 2 : 3);
}

main().catch((e) => { console.error('[spike] unhandled:', e); process.exitCode = 1; });
