# Presage Party

Social party games where your body is the controller — powered by the
[Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs).

Submission for the **Presage SmartSpectra SDK Challenge** (Nov 4–22, 2026).

---

## What is this?

A single Electron app with several party modes that respond to **real-time
physiological signals** captured through your camera:

- **Flinch Royale** — keep your composure. Last calm player wins.
- **Breath Vault** — escape a room by slowing your breath.
- **Body as Instrument** — play music with pulse, breathing, and expressions.
- **Breathe Together** — two players must synchronize their breathing.
- **It Knows Your Heartbeat** — a horror mode where the monster hears your pulse.
- **Breath Switch** — hands-free accessibility input (experimental).
- **Plant Calm** — a small idle mode for winding down.

All modes are governed by one **ConsentGate**: camera indicator always visible,
one-tap stop & delete, and **no video ever leaves your device**.

## Privacy by design

- Camera runs **only** inside the Electron main process
- Only **derived metrics** (pulse, breathing rate, HRV, expression class) leave
  the process, and only for gameplay
- **No accounts. No persistent profiles. No server-side biometric storage.**
- SDK telemetry is **disabled** (`enableTelemetry = false`)
- Optional "sample recording" mode lets judges test the app **without a camera**

## Try it without a camera

The app ships with **replay mode**: press `R` on the consent screen to load a
recorded stream of derived metrics. Gameplay works exactly the same.

## Quick start

```bash
pnpm install
pnpm --filter @presage-party/desktop dev
```

Full setup, testing, and troubleshooting: see [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Status

?? In active development until **Nov 22, 2026**.

Live changelog: [`CHANGELOG.md`](./CHANGELOG.md).
Roadmap: [`ROADMAP.md`](./ROADMAP.md).

## Disclaimer

Presage Party is **not a medical device**. It does not diagnose, treat, monitor,
or make medical decisions. Physiological signals are used only as entertainment
inputs. If a number looks alarming, ignore it and talk to a doctor — this app
cannot.

## License

MIT for our code. SmartSpectra SDK is subject to Presage's terms.

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

*Note for players: To play Level 3 in multiplayer, both machines must have these videos downloaded to `apps/desktop/fixtures/distractions/`.*
