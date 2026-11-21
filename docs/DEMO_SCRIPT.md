# Demo Script — Presage Party (Flinch Royale)

**Duration:** 3:00 · **Resolution:** 1080p60 · **Audio:** Game SFX + Voiceover
**Iris Gate:** First 20s MUST show a live signal changing AND the game responding.

**Reality check:** The demo runs in **replay mode** (Windows native SDK is blocked
by TPM/CNG). The metrics replayed are real SmartSpectra output from a recorded
face video, processed in our WSL pipeline. Same pipeline, same game logic.

---

## Segment 1 — Title Card (0:00-0:08)

| Beat | Visual | Audio |
|------|--------|-------|
| 0:00 | Black ? animated logo "PRESAGE PARTY" | Ambient pad fades in |
| 0:04 | Tagline: "Last calm player wins." | VO: "What if your face — not your fingers — controlled the game?" |
| 0:07 | Logo holds | SFX: subtle whoosh |

---

## Segment 2 — Live Signal to Game (0:08-0:28)  -- IRIS GATE

| Beat | Visual | Audio |
|------|--------|-------|
| 0:08 | Split screen: LEFT = face30.mp4 · RIGHT = replay HUD (br, blink, talk) | VO: "SmartSpectra reads breathing, blink, and facial expression." |
| 0:14 | HUD numbers change live (br: 14 ? 17, blink: 0 ? 1) | VO: "In real time. No video leaves the device." |
| 0:20 | Cut to game screen, composure bar visibly drops | SFX: "FLINCH!" popup |
| 0:26 | Result screen (score visible) | SFX: score settle |

**Fallback if face30.mp4 has privacy concerns:** Use silhouette overlay + show only metrics numbers.

---

## Segment 3 — Name Entry and Consent (0:28-0:40)

| Beat | Visual | Audio |
|------|--------|-------|
| 0:28 | Name entry screen, type "DemoPlayer" | SFX: keystrokes |
| 0:32 | Consent screen holds for 3s (4 privacy bullets visible) | VO: "Camera and video never leave the device. Only derived metrics." |
| 0:37 | Click "Chill Mode" button | SFX: button click |

---

## Segment 4 — Solo Level 3: "Why So Serious?" (0:40-1:15)

| Beat | Visual | Audio |
|------|--------|-------|
| 0:40 | Level 3 button (red outline) hover + click | SFX: distinct level-3 chime |
| 0:43 | Side-by-side layout: challenge video + HUD | TTS: "Don't blink. I dare you." |
| 0:48 | Distraction text popup floats up | TTS: "Are you scared yet?" |
| 0:55 | Player simulates laugh ? talk counter increments ? composure drops | SFX: talk penalty tick |
| 1:05 | Second distraction appears | TTS: "Almost had you." |
| 1:10 | Composure under 30% (red bar), timer runs out | SFX: timer tick |
| 1:13 | Result screen: "You survived" | SFX: victory chime |

---

## Segment 5 — Solo Level 4: "Don't Scream" (1:15-1:45)

| Beat | Visual | Audio |
|------|--------|-------|
| 1:15 | Click Level 4 button (purple outline) | SFX: horror stinger |
| 1:20 | Timer counts 30 ? 20, no distractions (tension building) | SFX: heartbeat rhythm |
| 1:20 | JUMPSCARE overlay (face flashes, red bg) at ~4s elapsed | SFX: jumpscare scream |
| 1:40 | Post-jumpscare blink ? composure drops -25% | SFX: "FLINCH!" |
| 1:43 | Result screen shows score | VO: "Blink after a scare — it costs you." |

---

## Segment 6 — Multiplayer Deterministic Sync (1:45-2:35)

**Setup:** Two Electron windows side-by-side (W1 = host, W2 = guest).

| Beat | Visual | Audio |
|------|--------|-------|
| 1:45 | W1: Create Room (no password) ? "Room A1B2" large | VO: "Two players. Same room. Same chaos." |
| 1:52 | W2: enter "A1B2" ? Join ? both screens show "Player joined" | SFX: join chime |
| 2:00 | W1: Level 3, 30s ? Start Game button | SFX: countdown |
| 2:05 | **BOTH windows play SAME distraction video simultaneously** (zoom to prove sync) | VO: "Same video. Same jumpscare. Deterministic seed from the room code." |
| 2:15 | Both score screens appear at the same time | SFX: result chime |
| 2:22 | W1 clicks Rematch ? **BOTH windows play a DIFFERENT video** | VO: "Rematch rotates by three — nobody memorizes the jumpscare." |
| 2:30 | Zoom to video filenames if visible in HUD (optional) | SFX: rotate whoosh |

---

## Segment 7 — Anti-Cheat (2:35-2:50)

**Setup:** Start a game. During round, minimize W2.

| Beat | Visual | Audio |
|------|--------|-------|
| 2:35 | W2 minimize (Windows taskbar click) | SFX: window swoosh |
| 2:39 | W1 status text: "Opponent minimized — penalty applied!" | SFX: penalty ding |
| 2:42 | Restore W2 ? composure visibly lower than W1 | VO: "-10 composure every 3 seconds. No hiding." |
| 2:47 | W2 shows -10 popup animation | SFX: penalty popup |

---

## Segment 8 — Outro (2:50-3:00)

| Beat | Visual | Audio |
|------|--------|-------|
| 2:50 | Tech stack overlay: Electron · Socket.IO · Presage SmartSpectra | Music swells |
| 2:55 | GitHub URL + "Built for Presage Challenge" | VO: "Play Flinch Royale. Last calm player wins." |
| 2:58 | Fade to black | Music fades out |

---

## Timing Budget

| Segment | Duration | Running Total |
|---------|----------|---------------|
| 1. Title | 8s | 0:08 |
| 2. Live signal | 20s | 0:28 |
| 3. Consent | 12s | 0:40 |
| 4. Solo L3 | 35s | 1:15 |
| 5. Solo L4 | 30s | 1:45 |
| 6. Multiplayer | 50s | 2:35 |
| 7. Anti-cheat | 15s | 2:50 |
| 8. Outro | 10s | 3:00 |

**Total: 180 seconds (3:00) — hard cap.**

---

## Recording Rules

- **Backup take:** Record Segment 5 (jumpscare) and Segment 6 (multiplayer) twice.
- **Reset state:** Between segments, return to consent screen (not game-over).
- **Mouse:** Hide cursor during gameplay segments (use OBS "hide cursor" or screen recorder setting).
- **Windows notifications:** Turn off Focus Assist / Do Not Disturb during recording.
- **Audio:** Test TTS on Windows first (Level 3 uses `speechSynthesis`).

---

## Voiceover Script (draft)

> "What if your face — not your fingers — controlled the game?"
> "SmartSpectra reads breathing, blink, and facial expression in real time. No video leaves the device."
> "Level 3: survive a random video without laughing."
> "Level 4: horror. Blink after a scare, and it costs you."
> "Two players. Same room. Same video. Same jumpscare."
> "Rematch rotates by three — nobody memorizes the jumpscare."
> "-10 composure every 3 seconds. No hiding."
> "Play Flinch Royale. Last calm player wins."

---

## References

- Iris gate: `PERSONAS.md` -- Demo Director
- Lesson L010: demo video is 50% of practical score
- `CHALLENGE_INFO.md` -- official rules
