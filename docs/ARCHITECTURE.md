# Architecture — Presage Party

> 🚧 PLACEHOLDER. File ini disebut di `README.md` dan `SYSTEM_PROMPT.md`
> tetapi isi lengkapnya ditulis di Phase 1 (lihat `ROADMAP.md`).
>
> Keputusan sementara: lihat `DEV_NOTES.md` § Recent decisions dan
> `docs/SECURITY.md` trust boundaries.

## TODO

- [ ] Diagram proses (main / preload / renderer / server)
- [ ] Kontrak IPC (`getLatestMetrics`, `ConsentGate`, shutdown)
- [ ] Batas paket: `packages/shared` (types + signing + plausibility)
- [ ] Sumber sample: `useFile` (replay) vs `useMediaStream` (live)
- [ ] Alasan Socket.IO vs WebRTC (kill-list sudah menetapkan)
