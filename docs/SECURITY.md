# Security & Threat Model — Presage Party

## Threat Addressed: Anti-Cheat (Minimize Detection)
- **Issue:** Players can minimize the game to avoid watching scary videos (Level 3/4).
- **Solution:** Renderer listens to `document.visibilitychange`. If hidden, it emits `visibility_change(false)` to the server.
- **Enforcement:** Server starts a `setInterval` and emits `cheat_penalty(10)` every 3 seconds while hidden. Client subtracts 10 composure. (Note: In the future, the server itself should calculate composure to prevent JS tampering).

## Threat Addressed: Replay/Injection
- **Issue:** A malicious client spoofs `report_score`.
- **Solution (Planned):** Move the Socket.IO server to a public host (Render) and enforce authoritative scoring (server runs the game loop timer and validates metrics). Currently, scores are client-reported.

## Privacy Guarantees
- Camera access only in `src/renderer/`.
- `sdk-bridge` never logs raw samples.
- No video, frames, or images cross the IPC boundary.
- No biometric data written to disk or database.
- SDK telemetry disabled (`enableTelemetry = false`).
