# Roadmap — Presage Party

**Start:** Nov 5, 2026 · **Deadline:** Nov 22, 2026, 11:59 PM PST (= Nov 23 ~15:00 WIB)

Rule of thumb: **ship early, polish late**. Every phase has a hard exit criterion.
If a phase slips more than one day, cut scope — never the SDK integration.

---

## Phase 0 — SDK Spike (Nov 5–6, 2 days)

**Goal:** prove that SmartSpectra works on this machine with Electron.

- [ ] `pnpm init` workspace, empty `apps/desktop`, `apps/server`
- [ ] Install `@smartspectra/node-sdk`, `electron@latest` (>= 42.11.16, CVE-2026-115570 patched)
- [ ] Get API key from Presage developer portal
- [ ] Minimal Electron window that shows live `pulse`, `breathingRate`, `hrv`, `expression`
- [ ] Confirm nil-value behavior: log samples with missing pulse vs missing breathing
- [ ] Confirm telemetry opt-out works (`enableTelemetry = false`)

**Exit criterion:** a screen in Electron that shows live numbers changing as I breathe
differently. If this fails on day 2, **stop and reconsider the whole project.**

---

## Phase 1 — Shell + Consent (Nov 7–8, 2 days)

**Goal:** the safety layer every mode depends on.

- [ ] `ConsentGate` component: explanation, explicit allow, camera indicator
- [ ] `Stop & Delete Session` button that shuts down SDK and clears buffers
- [ ] `sdk-bridge` package: normalizes nil values, keeps last valid sample
- [ ] IPC channels: `main ? preload ? renderer` for `getLatestMetrics()`
- [ ] Plant Calm mode — simplest possible game, validates the whole pipe

**Exit criterion:** Plant Calm grows a plant when I breathe slowly, and shrinks
when I don't. Consent gate blocks all modes until accepted.

---

## Phase 2 — Flinch Royale (Local) (Nov 9–11, 3 days)

**Goal:** the demo centerpiece, single-device.

- [ ] Round loop: 30s, composure meter, elimination under threshold for 2s
- [ ] Local pass-and-play: two players alternate rounds on one laptop
- [ ] Score screen, winner screen, restart
- [ ] "Blink challenge" bonus round (framed as game mechanic)

**Exit criterion:** I can play against myself, lose a round, and want to play
again. If it's not fun solo, multiplayer won't save it.

---

## Phase 3 — Server + Multiplayer (Nov 12–14, 3 days)

**Goal:** two Electron instances in one room.

- [ ] Socket.IO server skeleton (already drafted — see `DEV_NOTES.md`)
- [ ] `verifyBatch` + `validateBatch` wired in
- [ ] Room code join flow, presence broadcast, camera-active indicator
- [ ] Flinch Royale remote: two players, server computes scores
- [ ] Reconnect handling: brief disconnect does not kill the room
- [ ] Rate limit before signature verify (critical ordering)

**Exit criterion:** two laptops on the same LAN, playing one full round,
with no cheats passing plausibility checks.

---

## Phase 4 — Second Visual Mode (Nov 15–16, 2 days)

**Goal:** one more mode that looks great in a 20-second clip.

Pick **one** of:
- **Body as Instrument** (Web Audio) — highest visual payoff per hour
- **Breath Vault** (Phaser) — highest narrative payoff

Do **not** do both.

---

## Phase 5 — Polish + Submission Artifacts (Nov 17–19, 3 days)

- [ ] `README.md` finalized (one paragraph + GIF + judge mode)
- [ ] `INSTRUCTIONS.md` for judges
- [ ] Sample recording file included
- [ ] `CHANGELOG.md` up to date
- [ ] `SECURITY.md` finalized (threat model)
- [ ] Remaining modes (Breathe Together, It Knows, Breath Switch) documented
      but **not demoed**

**Exit criterion:** a stranger can clone the repo and play within 5 minutes.

---

## Phase 6 — Video + Submission Post (Nov 20–21, 2 days)

- [ ] Demo video recorded (3 min, script in `docs/DEMO_SCRIPT.md`)
- [ ] Backup recording (in case live recording glitches)
- [ ] DEV submission post drafted in the official template
- [ ] Prize category declared: **Most Creative** + **Best Thoughtful**
- [ ] Final self-review pass using Harsh Judge persona (see `PERSONAS.md`)

**Exit criterion:** every required element from `docs/CHALLENGE_INFO.md`
is present in the submission.

---

## Phase 7 — Buffer (Nov 22)

- [ ] Submit by **14:00 WIB** (not at the wire)
- [ ] Verify post is public and tag `#presagechallenge` is present
- [ ] Sleep

---

## Kill-list (things we are NOT doing)

- ? User accounts, login, signup, password reset
- ? Server database (Postgres, Redis, SQLite on server)
- ? Free-text chat
- ? WebRTC for low-latency sync (Socket.IO is enough)
- ? Mobile or browser version
- ? More than one mode beyond Phase 4
- ? Custom fonts, theme, "brand"
- ? Docs beyond what's listed above

Any item on the kill-list requires Harsh Judge persona approval before
reopening. Default answer is no.
