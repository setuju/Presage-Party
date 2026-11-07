# Architecture — Presage Party

## Process Diagram

```
+------------------------------+       +---------------------------+
¦  Electron Renderer (Windows) ¦       ¦  Socket.IO Server (Node)  ¦
¦                              ¦       ¦                           ¦
¦  - UI / Game Loop            ¦ emit  ¦  - Room State             ¦
¦  - PRNG (Room Code Hash)     +------?¦  - Anti-Cheat Intervals   ¦
¦  - Composure Logic           ¦       ¦  - Score Aggregation      ¦
¦  - <video> playback          ¦?------¦  - Host Migration         ¦
+------------------------------+       +---------------------------+
               ¦ IPC
+--------------?---------------+
¦  Electron Main (Windows)     ¦
¦  - protocol.handle           ¦
¦  - HTTP 206 Range Requests   ¦
¦  - File System (fixtures)    ¦
+------------------------------+
```

## Hybrid Processing (The Pivot)
The SmartSpectra SDK runs natively on Linux but fails on Windows due to TPM/CNG key storage issues (`kConfigurationFailed`). We pivoted to a hybrid architecture:
1. **WSL (Linux):** The spike (`spike-file.mts`) processes a recorded video (`face30.mp4`) and exports `face30.metrics.json`.
2. **Windows:** Electron reads this JSON to drive the game loop.
3. **Why this is valid:** The data is derived from the real SDK. The game logic is completely decoupled from the hardware layer.

## Deterministic Multiplayer
To ensure both players experience the exact same distractions without heavy network synchronization of video streams:
- Server sends `roomCode`.
- Client hashes the string (`hash = ((hash << 5) - hash) + char`) to generate a 32-bit integer.
- This integer seeds a `mulberry32` PRNG.
- Any `rng()` call produces the exact same sequence on both machines.
- On rematch, a `+3` offset is added to the index to rotate the videos.
