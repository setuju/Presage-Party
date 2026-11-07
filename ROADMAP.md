# Roadmap — Presage Party

**Start:** Nov 5, 2026 · **Deadline:** Nov 22, 2026, 11:59 PM PST (= Nov 23 ~15:00 WIB)

Rule of thumb: **ship early, polish late**. Every phase has a hard exit criterion.
If a phase slips more than one day, cut scope — never the SDK integration.

---

## Phase 0 — SDK Spike ✅ COMPLETE (Nov 7)

**Goal:** prove that SmartSpectra works on this machine with Electron.
**Outcome:** proved in pure Node 24 (WSL2 Ubuntu 26.04), 99.9% face detection,
0 errors, breathing rate emitted via accumulatedMetrics. Electron deferred to Phase 1.

- [x] `pnpm init` workspace, empty `apps/desktop`, `apps/server`
- [x] Install `@smartspectra/node-sdk@3.4.0` (Electron deferred to Phase 1)
- [x] Get API key from Presage developer portal
- [x] Harness that logs pulse/breathing/HRV/expression
- [x] Confirm nil-value behavior: metrics stream emits traces, not rates
- [x] Confirm telemetry opt-out works (`enableTelemetry = false`)

**Pivot:** WSL2 has no `/dev/video*`. Proved SDK via `useFile()` with
recorded face video, not live camera. Electron + live camera deferred to
Phase 1, with Windows-native as the leading candidate.

**Findings:**
- SDK works in pure Node 24.21. FFI (koffi) loads cleanly.
- `metrics` stream carries traces (breathing.upperTrace) and presence flags
  (face.blinking.stable, face.talking.stable), not rates.
- `accumulatedMetrics` (via `enableAccumulatedOutput: true`) carries derived
  rates: `breathing.rate[].value`, `.confidence`, optional `.stable`.
- 30fps CFR + `interframeDelayMs: 33` -> 0 non-monotonic warnings.
- 60fps native + `interframeDelayMs: 16` -> 743 warnings but recovers.
- Cardio (pulse) dropped for Phase 2 due to CPU cost on target hardware.

**Exit criterion (original):** a screen in Electron that shows live numbers
changing as I breathe differently. **Revised exit criterion met:**
`[spike] OK -- 3176 metrics events, breathing rate emitted via
accumulatedMetrics, 0 errors.`


---

## Phase 1 — Shell + Consent ✅ COMPLETE (Nov 7)

**Goal:** the safety layer every mode depends on.

- [x] `ConsentGate` component: privacy bullets, explicit "Use replay", "Cancel"
- [x] `Stop & Delete Session` button pauses video, clears src, resets state
- [x] IPC channels: `main → preload → renderer` for `getTimeline()`, `getVideoUrl()`
- [x] Replay playback: `<video>` synced to `face30.metrics.json` via rAF
- [ ] `sdk-bridge` package: normalizes nil values, keeps last valid sample (moved to Phase 2/3)
- [ ] Plant Calm mode (deferred; replay player validates the pipeline instead)

**Pivot:** Windows native SDK is blocked by TPM/CNG. Replay mode became the
primary validation path. `presage://` protocol serves `fixtures/` locally.

**Exit criterion (revised):** ConsentGate blocks playback until accepted.
User can play replay video, see live metrics (breathing, blink, talk, rate),
and hit Stop & Delete to return to a clean state.

## Phase 2 — Flinch Royale (Local) ✅ COMPLETE (Nov 7)

**Goal:** the demo centerpiece, single-device.

- [x] Round loop: 30s, composure meter, elimination under threshold for 2s
- [x] Local pass-and-play: two players alternate rounds on one laptop
- [x] Score screen, winner screen, restart
- [x] "Blink challenge" bonus round (framed as game mechanic)

**Exit criterion:** I can play against myself, lose a round, and want to play
again. If it's not fun solo, multiplayer won't save it.

**Result:** Playtested successfully. Tuned penalties to be survivable:
Blink (-4, 2s cooldown), Talk (-8, 2s sustained), Rate >24bpm (-1/sec).
Playtest ended with 39% composure, proving the game is winnable but tense.

## Phase 3 — Server + Multiplayer ✅ COMPLETE (Nov 8)

**Goal:** two Electron instances in one room.

- [x] Socket.IO server skeleton 
- [x] Room code, lobby list, password protection
- [x] Flinch Royale remote: synchronized deterministic logic
- [x] Host migration (if host leaves, guest becomes host)
- [x] Anti-cheat (minimize detection)
- [x] Rematch Rotation (+3 offset for video/text/jumpscare sequences)

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

## Future Development (Post-Hackathon)

- **Persistent Accounts**: Currently, usernames and scores reset on app close.
  Future plan: Add an opt-in registration/login system (Firebase or Supabase)
  so users can save their lifetime stats and appear on a global leaderboard.
- **Web Version**: Deploy the Electron renderer as a web app (Vercel) with a
  cloud-hosted Socket.IO server (Render/Railway).
- **Live Camera**: Integrate actual webcam support when the SDK stabilizes on
  Windows (currently blocked by TPM/CNG issues).
