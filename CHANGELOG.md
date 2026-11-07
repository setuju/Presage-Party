# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not follow strict SemVer — it is a hackathon submission.

## [Unreleased]

### Added
- `--out=<path>` flag on `spike-file.mts` — writes compact replay JSON
  (`videoPath`, `generatedAt`, `sdkVersion`, `durationMs`, `samples[]`,
  `rates[]`). face30.mp4 output: 739 samples, 30 rates, ~70 KB.
- `@types/node@^22.10.0` devDependency for `apps/desktop`.

### Changed
- Phase 1 data source is replay JSON on disk, not a runtime bridge.
  WSL runs the spike once; Windows Electron reads the JSON.
- Fixtures convention: `apps/desktop/fixtures/` because `pnpm --filter`
  changes CWD to the package root.

### Fixed
- `spike-file.mts`: EOF detection now polls `sdk.processingStatus` via
  `setImmediate` (SDK 3.4.0 does not reliably emit `kRunning` or terminal
  `kIdle` from `processingStatus` for file playback). Falls back to
  `waitUntilComplete()` after 30 s if polling never leaves `kIdle`.
- PowerShell: scripts >5 lines are written to `.ps1` first, then
  executed. Prevents PSReadLine buffer-overflow mid-paste.
- Bash paste bubbles: no `set -e` at top level; see `LESSONS.md` L016
  and L017.

### Security
- (populate for any security-relevant change)

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
