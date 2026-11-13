# Security & Threat Model — Presage Party

## Scope

This document covers the threats we *explicitly chose to address*, the
threats we accept as out-of-scope, and the trade-offs we make out loud
(per `LESSONS.md` L009). It is a living document; every change to
attack surface updates this file (`SYSTEM_PROMPT.md` §7).

---

## Threat Addressed: Anti-Cheat (Minimize Detection)

**Issue.** Players can minimize the game to avoid watching scary videos
(Level 3/4) or distraction content.

**Solution (implemented).**
- Renderer listens to `document.visibilitychange`. On change, it emits
  `visibility_change(isVisible)` to the server.
- Server starts a **recurring** penalty tick:
  - Recursive `setTimeout(tick, 3000)`.
  - Each `tick`: emits `cheat_penalty(10)` to the cheater and
    `opponent_cheated` to the opponent.
  - Auto-stops when `currentRoom.startAt` is cleared (game over) or the
    client returns visible.
- Client applies `f_composure = Math.max(0, f_composure - 10)` on
  `cheat_penalty`.
- **Never auto-kicks.** Red line: `SYSTEM_PROMPT.md` §5 — no auto-kick on
  a single anomaly (per `LESSONS.md` L014). Multiple strikes = kick was
  discussed but not shipped; recurring -10 is the shipped mitigation.

**Residual risk.** A determined cheater can block the `visibility_change`
emit via DevTools, or patch `renderer.js` to no-op the `cheat_penalty`
handler. See "Client-Side Trust" below.

---

## Threat Addressed: Score Injection

**Issue.** A malicious client spoofs `report_score` with a high score.

**Solution (planned, not shipped).** Move Socket.IO server to a public
host (Render/Railway) and enforce server-authoritative scoring: server
runs the game loop timer and validates metrics plausibility. Currently
scores are client-reported.

**Trade-off.** Server-authoritative scoring requires the server to see
metrics, which conflicts with privacy-first architecture (no video leaves
the device — but metrics are already going to the server for anti-cheat,
so this is a question of *what* the server can validate, not *whether*
data flows). Post-hackathon work.

---

## Threat: Client-Side Trust

**Issue.** `renderer.js` is bundled JS. A cheater with DevTools can:
- Patch `f_composure` to never drop.
- Suppress `cheat_penalty` handler.
- Override `visibility_change` emit.

**Mitigation.** Same as score injection: server-authoritative game state.
Post-hackathon.

**Why we shipped anyway.** This is a party game among friends. The
attacker model is "a friend who wants to win a laugh", not "a stranger
on the internet". Social context (see L013 — "Presence is social
anti-cheat") does most of the work. Documented trade-off.

---

## Privacy Guarantees (Verified)

- ✅ Camera access only in `src/renderer/` (`getUserMedia` in Electron
  main → renderer). Frames never cross the IPC boundary.
- ✅ `sdk-bridge` never logs raw samples to disk or console.
- ✅ No video, frames, or images cross IPC boundary or network.
- ✅ No biometric data written to disk or database.
- ✅ SDK telemetry disabled (`enableTelemetry = false`).
- ✅ Consent gate before any session starts (see `LESSONS.md` L002).
- ✅ "Stop & Delete Session" clears state, pauses video, resets protocol.

**What leaves the device:** derived metrics only — booleans
(`blink`, `talk`), rate values (breathing bpm), timestamps. No face
landmarks, no raw camera, no audio. Replay mode uses pre-recorded metrics
(no camera at all).

---

## Open Surface (documented, not mitigated)

| Surface | Risk | Accept? |
|---|---|---|
| Local Socket.IO `ws://127.0.0.1:3000` | Any local process can connect and emit events (e.g., `report_score`). | Yes — local multiplayer by design, ephemeral rooms. |
| `presage://` protocol serves `fixtures/` | Any renderer code path can read any file in `fixtures/`. | Yes — fixtures are bundled with app, not user data. |
| `file://` origin CSP | Allows `unsafe-inline` for styles (needed for inline animation state). | Yes — no user-controlled strings flow into styles. |
| Replay mode | An attacker could replace `face30.metrics.json` to inject fake metrics. | Yes — same trust boundary as replacing any bundled asset. |

---

## Red Lines (mirrors `SYSTEM_PROMPT.md` §5)

- ❌ No video/frames/images leave the device
- ❌ No biometric data stored on disk or in a database
- ❌ No medical terminology anywhere in code, comments, UI, or docs
- ❌ No accounts, login, or persistent profiles
- ❌ No `ws://` in any config (uses `http://127.0.0.1` + CSP allow-list)
- ❌ No Electron below 42.11.16 (CVE-2026-115570)
- ❌ No telemetry enabled in SDK config
- ❌ No auto-kick on a single anomaly (recurring -10, never kick)
- ❌ No free-text chat (Quick Chat presets only)
- ❌ No server-side database
- ❌ No relying on a self-claimed "camera active" flag (must derive from
  SDK heartbeat)
- ❌ No merging to `main` without a changelog entry

---

## References

- `LESSONS.md` L009, L013, L014, L023, L024
- `PERSONAS.md` — Rhea (Security) and Sol (Privacy) sign-off required
  for any change in this file
- `docs/ARCHITECTURE.md` — anti-cheat implementation details
- `SYSTEM_PROMPT.md` — red lines and decision framework
