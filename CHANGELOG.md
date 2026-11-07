# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not follow strict SemVer — it is a hackathon submission.

## [Unreleased]

### Added
- (populate as you build)

### Changed
- (populate as you change)

### Fixed
- `spike-file.mts`: EOF detection now polls `sdk.processingStatus` via
  `setImmediate` (SDK 3.4.0 does not reliably emit `kRunning` or terminal
  `kIdle` from `processingStatus` for file playback). Falls back to
  `waitUntilComplete()` after 30 s if polling never leaves `kIdle`.

### Security
- (populate for any security-relevant change)

---

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
