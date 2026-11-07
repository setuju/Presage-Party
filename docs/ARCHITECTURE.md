# Architecture — Presage Party

> 🚧 PLACEHOLDER. This file is referenced in `README.md` and `SYSTEM_PROMPT.md`
> but the full content will be written in Phase 1 (see `ROADMAP.md`).
>
> Interim decisions: see `DEV_NOTES.md` § Recent decisions and
> `docs/SECURITY.md` trust boundaries.

## TODO

- [ ] Process diagram (main / preload / renderer / server)
- [ ] IPC contract (`getLatestMetrics`, `ConsentGate`, shutdown)
- [ ] Package boundaries: `packages/shared` (types + signing + plausibility)
- [ ] Sample sources: `useFile` (replay) vs `useMediaStream` (live)
- [ ] Rationale for Socket.IO vs WebRTC (kill-list already settled)
