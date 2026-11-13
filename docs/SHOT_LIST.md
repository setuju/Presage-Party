# Shot List — Presage Party Demo Video

Checklist for recording day. Each shot lists setup, takes required, and backup.

**Recording tools:**
- OBS Studio (1080p60, hide cursor, no notifications)
- Windows Focus Assist: ON
- Terminal font size: 14pt (readable at 1080p)
- Close all non-demo windows

---

## Pre-Record Checklist

- [ ] WSL terminal running: `pnpm --filter @presage-party/server dev`
- [ ] Electron window 1 launched: `run-phase-1c-fixed.ps1`
- [ ] Electron window 2 launched: `run-electron.ps1`
- [ ] Both windows resized to 960x540 (side-by-side fits 1920x1080)
- [ ] Face cam ready (optional, for Segment 2)
- [ ] Audio levels checked (TTS test on Level 3)
- [ ] Backup take storage: at least 5GB free
- [ ] Screen recorder: OBS project saved

---

## Shot 1 — Title Card (0:00-0:08)

**Setup:** Post-production (After Effects / DaVinci Fusion).
**Takes:** 1 (static, no acting needed).
**Fallback:** Static PNG with logo.

---

## Shot 2 — Live Signal (0:08-0:28)

**Setup:**
- LEFT: `apps/desktop/fixtures/face30.mp4` playing in VLC (muted)
- RIGHT: Replay HUD from Electron (click "Metrics Replay (Dev)")

**Takes:** 3 (face30.mp4 may have recognizable features — check before final).

**Fallback:** Silhouette overlay + numbers only.

**Privacy:** If face30.mp4 shows identifiable person, blur or replace with silhouette.

---

## Shot 3 — Name + Consent (0:28-0:40)

**Setup:** Electron window 1, fresh launch.
**Takes:** 2 (typing rhythm).
**Note:** Type "DemoPlayer" — never use real names.

---

## Shot 4 — Solo L3 (0:40-1:15)

**Setup:** Level 3 button, wait for TTS test.
**Takes:** 3 (TTS timing unpredictable — need clean take).

**Risk:** `speechSynthesis` voice may differ on machine. **Test first:**
```powershell
# PowerShell, ASCII only
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Speak("Don't blink. I dare you.")
```

**Fallback:** If TTS missing, record subtitles in post.

---

## Shot 5 — Solo L4 Jumpscare (1:15-1:45)

**Setup:** Level 4, fresh start.
**Takes:** 4 (jumpscare timing + reaction sync).

**Critical:** Record **face cam** during this segment. Jumpscare reaction = money shot.

**Backup take:** YES — record 2 full runs.

---

## Shot 6 — Multiplayer Sync (1:45-2:35)

**Setup:**
- Window 1 (host): left half of screen
- Window 2 (guest): right half of screen
- Both on Level 3, 30s

**Takes:** 4 (network sync must be clean).

**Proof moment:** Both windows showing the same video frame at same timestamp.
Freeze frame in post to emphasize.

**Backup take:** YES — record 2 full rounds.

---

## Shot 7 — Anti-Cheat (2:35-2:50)

**Setup:** Continue from Shot 6 round, or fresh round.

**Sequence:**
1. Round active, both windows playing
2. Minimize W2 (Alt+Tab or taskbar click)
3. Wait 3s (first penalty tick)
4. Wait 3s more (second tick — proves recurring)
5. Restore W2 (W2 composure now ~20% lower)

**Takes:** 2.

**Backup take:** YES — timing must show 2+ ticks.

---

## Shot 8 — Outro (2:50-3:00)

**Setup:** Post-production.
**Takes:** N/A.
**Fallback:** Static slide.

---

## Post-Production Checklist

- [ ] Cut to 3:00 exactly (hard cap)
- [ ] Captions on all VO lines (accessibility)
- [ ] Blur any recognizable faces in face30.mp4 if needed
- [ ] Export: H.264, 1080p60, CRF 20, faststart
- [ ] Backup export: H.264, 720p60, CRF 24 (for slow connections)
- [ ] Thumbnail: frame from jumpscare + logo overlay

---

## Common Pitfalls

1. **TTS not playing** — Windows voice may not be installed. Test first.
2. **Multiplayer not syncing** — Server must be running. `git diff` to confirm anti-cheat fix applied.
3. **Composure bar not dropping** — Anti-cheat fix required (recurring penalty). Verify.
4. **Video buffering** — `presage://` Range 206 in place. If stutter, disable hardware acceleration in `main/index.ts`.
5. **Focus Assist** — Windows notifications will appear in recording. Turn off.

---

## References

- Full script: `docs/DEMO_SCRIPT.md`
- Iris gate: `PERSONAS.md` — Demo Director
- Recording lesson: `LESSONS.md` L010
