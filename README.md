# Presage Party

Social party games where your body is the controller — powered by the
[Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs).

Submission for the **Presage SmartSpectra SDK Challenge** (Nov 4–22, 2026).

---

## What is this?

**Flinch Royale** is a social party game built on real-time physiological signals captured through your camera. Keep your composure while facing increasing levels of distraction.

- **Solo Mode:** Test your composure across 4 distinct levels.
- **Multiplayer Mode:** Create a room, challenge a friend, and see who survives longest. Play with synchronized videos and jumpscares via deterministic hashing.

### ?? Game Modes
1. **Chill Mode:** Baseline test. Just you and your vitals.
2. **Seriously?:** Computer-generated text and audio distractions.
3. **Why So Serious?:** A randomized video challenge. You must endure without laughing or flinching.
4. **Don't Scream:** The horror test. Sudden audiovisual jumpscares. Blinking or a heart rate spike immediately after a scare results in severe composure loss.

## Privacy by design

- Camera runs **only** in the Electron renderer.
- Only **derived metrics** (pulse, breathing rate, HRV, expression class) are used.
- **No accounts. No persistent profiles. No server-side biometric storage.**
- SDK telemetry is **disabled** (`enableTelemetry = false`).
- Optional "sample recording" mode lets judges test the app **without a camera**.

## Multiplayer Royale (New!)
- **Private & Public Rooms:** Create a room with an optional password.
- **Synchronized Gameplay:** Both players face the exact same sequence guaranteed by room-code hashing.
- **Dynamic Rematches:** Every rematch rotates the distraction sequence by +3.
- **Anti-Cheat:** Minimizing the window incurs a -10 composure penalty every 3 seconds.

## Quick start

```bash
pnpm install
pnpm --filter @presage-party/desktop dev
pnpm --filter @presage-party/server dev
```

Full setup, testing, and troubleshooting: see [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Video Assets Credits

Level 3 ("Why So Serious?") uses the following YouTube Shorts as distraction assets. Special thanks to the original creators:

- https://www.youtube.com/shorts/ENYYKdgvmI0
- https://www.youtube.com/shorts/TjGEfYBJrxE
- https://www.youtube.com/shorts/yGgVbch7awY
- https://www.youtube.com/shorts/EAsEsT4dTTw
- https://www.youtube.com/shorts/OHc_ZH_pkhQ
- https://www.youtube.com/shorts/_Nc_i7QuOP0
- https://www.youtube.com/shorts/a3b-Ha9UIv0
- https://www.youtube.com/shorts/5_54xuBh5_k

## Status

?? In active development until **Nov 22, 2026**.
See [`HANDOFF.md`](./HANDOFF.md) for the latest technical state.
