# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not follow strict SemVer — it is a hackathon submission.

## [Unreleased]

### Added
- (populate as you build)

---

## [0.3.0] — 2026-11-07 — Phase 2 COMPLETE

### Added
- Flinch Royale game mode (30s survival loop).
- Composure meter with visual feedback (green/yellow/red).
- Debug HUD (blink/talk/rate counters) for playtesting and demo.
- Edge-triggered blink detection with cooldown.
- Time-accumulated talking detection (requires sustained input).

### Changed
- Tuned penalties based on playtest: blink (-4), talk (-8), rate (-1/sec).
- Rate threshold raised to 24 bpm to avoid false positives from normal
  movement.

### Fixed
- "Talking" false positives eliminated by using `dt` accumulation
  instead of sample count (see L020).
- Game is now mathematically survivable (see L021).

### Security
- No changes.

---

## [0.2.0] — 2026-11-07 — Phase 1 COMPLETE

### Added
- Electron shell: `main` (window, IPC), `preload` (contextBridge), `renderer`
  (plain HTML/JS, no bundler).
- `presage://` custom protocol serving `fixtures/` via `net.fetch`.
- `ConsentGate`: 3-screen state machine (consent → player → stopped).
  Privacy bullets + explicit "Use replay" / "Cancel".
- Replay playback: `<video>` synced to `face30.metrics.json` via
  `requestAnimationFrame`, cursor advances on `sample.t` with tolerance for
  duplicate timestamps.
- Live metrics panel: breathing amplitude, nearest rate + confidence,
  blink/talk flags, stable-rate indicator.
- "Stop & Delete" pauses video, removes `src`, resets state, moves to stopped.
- `@types/node@^22.10.0` devDependency for `apps/desktop`.
- `--out=<path>` flag on `spike-file.mts` — writes compact replay JSON.

### Changed
- Phase 1 data source is replay JSON on disk, not a runtime bridge.
- Fixtures convention: `apps/desktop/fixtures/` because `pnpm --filter`
  changes CWD to the package root.
- Windows native SDK blocked by TPM/CNG; hybrid architecture
  (WSL processing, Windows UI) adopted for replay mode.

### Fixed
- `spike-file.mts`: EOF detection polls `sdk.processingStatus` via
  `setImmediate` (SDK 3.4.0 does not reliably emit `kRunning` or terminal
  `kIdle` for file playback).
- PowerShell scripts >5 lines are written to `.ps1` first, then executed
  (see `LESSONS.md` L017).
- Bash paste bubbles: no `set -e` at top level (see `LESSONS.md` L016).
- Windows: zombie Electron process locks `dist/`; kill before `tsc`
  (see `LESSONS.md` L019).

---

## [0.1.0] — 2026-11-07 — Phase 0 COMPLETE

### Added
- Headless `useFile()` spike harness in pure Node 24 (no Electron required)
- `apps/desktop/.env.example` for SMARTSPECTRA_API_KEY
- `apps/desktop/scripts/spike-file.mts` — reads video, emits metrics + accumulatedMetrics
- 30fps CFR fixture generation (face30.mp4, ~16 MB, 73 s)

### Changed
- `interframeDelayMs` defaults to 33 to match 30fps CFR playback
- `requestedMetrics` explicit (`breathingMetrics + faceMetrics`), not SDK default
- `enableAccumulatedOutput: true` — required to receive derived rate metrics

### Fixed
- Non-monotonic timestamps: 743 -> 0 by re-encoding video to 30fps CFR
- Spike distinguishes kError vs wall-clock timeout (was reporting both as TIMEOUT)
- EOF detection polls `sdk.processingStatus` via `setImmediate` (SDK does not
  reliably emit kRunning/kIdle through the `processingStatus` event for file playback)

### Security
- All spike runs use `enableTelemetry: false`
- `apps/desktop/.env` gitignored; only `.env.example` committed
- `apps/desktop/fixtures/` gitignored (no face video in history)

### Documentation
- `ROADMAP.md`: Phase 0 marked complete with findings
- `DEV_NOTES.md`: session 3 entry with full empirical SDK surface
- This entry

## [0.0.1] — 2026-11-05

### Added
- Monorepo skeleton (`apps/desktop`, `apps/server`, `packages/shared`)
- SDK spike: SmartSpectra initialized in Electron main process
- `sdk-bridge` normalizer (nil-safe, last-valid-sample cache)
- Server skeleton: Socket.IO with `verifyBatch` + `validateBatch`
- `ConsentGate` component prototype
- Initial documentation set (`README`, `ROADMAP`, `LESSONS`, `PERSONAS`, `SECURITY`, `INSTRUCTIONS`, `SYSTEM_PROMPT`, `DEV_NOTES`, `ARCHITECTURE` placeholder, `DEMO_SCRIPT` placeholder)

### Security
- Electron pinned to >= 42.11.16 (CVE-2026-115570)
- Telemetry disabled (`enableTelemetry = false`)
- WSS-only Socket.IO transport (`transports: ['websocket']`)

---

## Template (copy for each release)

## [0.x.0] — YYYY-MM-DD

### Added
- _what new feature or file was added_

### Changed
- _what existing behavior changed, and why_

### Deprecated
- _what is on its way out, and when_

### Removed
- _what was removed, and why (link to the LESSONS.md entry if applicable)_

### Fixed
- _bugs, with link to the failing case if useful_

### Security
- _threat model updates, dependency bumps, config changes_

### Documentation
- _README/INSTRUCTIONS/LESSONS/PERSONAS updates_
