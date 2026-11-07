# Security & Threat Model — Presage Party

## Trust boundaries

```
+-------------------------+         +-------------------+
¦  Electron main process  ¦         ¦  Socket.IO server ¦
¦  - Camera               ¦         ¦  - Rooms          ¦
¦  - SmartSpectra SDK     ¦ metrics ¦  - Sessions       ¦
¦  - sdk-bridge           +--------?¦  - Scoring        ¦
¦  - Ed25519 signing      ¦  signed ¦  - In-memory only ¦
+-------------------------+         +-------------------+
            ¦ IPC (limited)
+-----------?-------------+
¦  Renderer (React/Phaser)¦
¦  - Game UI              ¦
¦  - No camera access     ¦
+-------------------------+
```

- **Client cannot be trusted** to report its own score.
- **Server cannot verify** that a signal is physiologically real without
  video — which we refuse to collect. This is a **documented trade-off**,
  not an oversight.

## Threats addressed

| # | Threat | Defense |
|---|---|---|
| T1 | Casual fabrication | Server-authoritative scoring + plausibility bounds |
| T2 | Replay | Per-round nonce + Ed25519 signature |
| T3 | Packet injection | Signature verify before state commit |
| T4 | MitM | WSS/TLS + Electron = 42.11.16 + optional cert pinning |
| T5 | DoS via expensive verify | Rate limit **before** signature verify |
| T6 | Collusion / alt accounts | Social (local party) + presence indicator; documented as out of technical scope |
| T7 | Perfect-play bot | Shadow flag on zero-noise + high-quality streams; **flag, not kick** |
| T8 | XSS via name | `sanitizeName()` on server |

## Threats explicitly out of scope

- Determining whether a *sophisticated* attacker is simulating human
  physiology. If the statistical profile matches a human, we cannot tell.
- Collusion between two cooperating humans. Money cannot be verified as
  earned.

## Privacy guarantees (enforced in code)

- Camera access only in `src/main/`
- `sdk-bridge` never logs raw samples
- No video, frames, or images cross the IPC boundary
- No biometric data written to disk or database
- SDK telemetry disabled (`enableTelemetry = false`)
- Server uses `Map<>` only; process exit wipes state

## Reporting

If you find a security issue, email the maintainer, do not open a public
issue.
