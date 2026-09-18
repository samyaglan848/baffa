# BAFFA (بَفّة) — Security Architecture & Threat Model

**Document Version:** 2.0.0  
**Author:** Lead Software Architect & Senior Game Security Engineer  
**Date:** August 24, 2026

---

## 1. Core Security Principle: "Never Trust The Client"

In BAFFA, the client is treated exclusively as an untrusted rendering viewport and input transmitter. All core game rules, tile distribution, turn progression, move legality, scoring, match target evaluation, role authorization, and cheating declarations are executed strictly on the backend.

```
+-------------------------------------------------------------------------+
|                              CLIENT TIER                                |
|  - Renders visual domino tiles & board felt                             |
|  - Emits user action intents: PLAY_TILE, PASS_TURN, VOICE_SIGNAL        |
|  - Tracks browser focus/visibility as weak advisory telemetry           |
+-------------------------------------------------------------------------+
                                    │
                         HTTPS / WSS (Encrypted)
                                    │
                                    ▼
+-------------------------------------------------------------------------+
|                        BACKEND SECURITY BOUNDARY                        |
|  - JWT Session Validation & Handshake Verification                      |
|  - Rate Limiting & Cumulative Anti-Cheat Risk Engine                    |
|  - Authoritative Game Engine (Zero Private Tile Leakage)                |
|  - Role-Based Access Control (Admin, Judge, Spectator, Player)          |
|  - Immutable Audit Logging (PostgreSQL Append-Only Trail)               |
+-------------------------------------------------------------------------+
```

---

## 2. Information Isolation & Anti-Inspection Architecture

### 2.1 Private Hand Concealment
1. **Server-Side Private State**: The full 28-tile distribution and all 4 private player hands are stored exclusively within `DominoGameEngine.hands: DominoTile[][]`.
2. **Role-Aware Serialization**:
   - `getSanitizedState(forSeat, 'PLAYER')`: Returns only the requesting player's 7 (or remaining) tiles in `myHand`. Opponents' hands are represented solely as `hiddenTilesCount: number`.
   - `getSanitizedState(null, 'JUDGE')`: `myHand` is strictly `[]`. Judges monitor public table play only.
   - `getSanitizedState(null, 'SPECTATOR')`: `myHand` is strictly `[]`. Spectators receive zero private cards.
3. **Payload Inspection Verification**: Automated tests (`anticheat-security.spec.ts`) verify that serialized JSON transmitted to client sockets never contains opponent tile arrays.

---

## 3. Authentication & Session Security

1. **Password Hashing**: Bcrypt with a salt work factor of 10 (or Argon2id in high-security production mode).
2. **Identifier Normalization**: Usernames and emails are lowercased and trimmed. Unique database constraints prevent duplicate registrations.
3. **JWT Session Model**:
   - Short-lived Access Tokens (1 hour expiry).
   - Long-lived Refresh Tokens (7 days expiry) stored with token rotation.
   - Socket.IO handshakes require valid JWT tokens; invalid tokens fall back to unprivileged guest view.
4. **Defense Against User Enumeration**: Login failures return generic `Invalid credentials provided` responses regardless of whether the username or password was incorrect.
5. **Rate Limiting**: IP and identifier-based throttling prevents brute-force credential stuffing.

---

## 4. Layered Anti-Cheat & Cumulative Risk Model

Per strict engineering guidelines, BAFFA rejects naïve auto-banning thresholds:

1. **Cumulative Risk / Evidence Engine**:
   - Rapid action intervals (<200ms) are recorded as **weak telemetry signals** (+5 risk points) to accommodate low latency or fast reflexes.
   - Out-of-turn actions, illegal tile attempts, and stale sequence numbers accumulate higher risk scores (+10 to +20 points).
   - System **never automatically bans or alters scores** solely based on timing.
2. **Action Sequencing**: Each valid state mutation increments `sequenceNumber`. Client actions with stale sequence numbers are cleanly rejected.
3. **Immutable Audit Trail**: Sensitive room actions (`MATCH_START`, `PLAY_TILE`, `PASS_TURN`, `JUDGE_PENALIZE_CHEATING`, `BOT_TAKEOVER`) are appended to the `AuditLog` table with timestamp and actor metadata.

---

## 5. Reconnection & Bot Takeover Hand Invariance

When a seated player disconnects during an active round:
1. **120-Second Grace Timer**: The room enters a 2-minute grace countdown.
2. **Authoritative Hand Preservation**:
   - The bot temporarily controls the seat using the **exact same tile array** (`this.hands[seat]`).
   - Bot moves strictly execute through `DominoGameEngine.playTile()`.
   - Zero tiles are duplicated; zero tiles are deleted or reset.
3. **Seamless Resumption**: When the human reconnects, they receive their exact authorized remaining hand.
4. **Admin Role Transfer**: If the room creator disconnects, the admin privileges temporarily transfer to their human teammate, and are seamlessly restored upon return.

---

## 6. Modular Voice Chat (WebRTC) Architecture

1. **Decoupled Design**: The WebRTC voice signaling layer is completely independent of the Domino Game Engine.
2. **Fault Tolerance**: Denying microphone permissions or experiencing WebRTC connection failure never interrupts or stalls the domino match.
3. **SFU Migration Path**: Voice signaling is designed with clean room session abstractions, allowing straightforward migration from peer-to-peer mesh to a media server (SFU) in future mobile scale phases.

---

## 7. Realistic Security Boundaries & Platform Limitations

To maintain architectural integrity, BAFFA explicitly acknowledges the technical boundaries of web browsers:

| Threat | Feasibility in Web Browsers | BAFFA Mitigation & Status |
| :--- | :--- | :--- |
| **Tampering with Hand State / Fake Tiles** | Fully Prevented | **100% Server Authoritative**. Engine validates tile ownership before placement. |
| **Inspecting Opponents' Cards in DevTools** | Fully Prevented | **100% Isolated**. Server never serializes opponent tiles to unauthorized clients. |
| **Stale Action Replay Attacks** | Fully Prevented | **Sequence Number Verification** on all state-mutating events. |
| **Screen Recording / Screenshots** | Platform Limitation | Cannot be technically blocked in standard web browsers. Watermarking and Judge oversight provide deterrence. |
| **External Camera Photographing Screen** | Physical Limitation | Physically impossible to prevent in software. Mitigated by tournament rules & Judge Mode. |
| **Switching Tabs / Backgrounding App** | Monitored | Broadcasts polite `APP_VISIBILITY_CHANGED` presence updates via `visibilitychange` & `blur`. |

---

## 8. Summary of Automated Security Test Coverage

- `packages/engine/src/tests/anticheat-security.spec.ts`:
  - Information isolation (Player, Judge, Spectator).
  - Authoritative hand invariance during bot takeover.
  - Judge cheating penalty score allocation.
  - All 7 Egyptian AI Bots legal move validation.
- `apps/server/src/tests/server-services.spec.ts`:
  - Bcrypt password hashing & JWT token rotation.
  - Rate limiting & sequence number rejection in Anti-Cheat.
  - Max 1 Judge and Max 1 Spectator limits in Room Service.
  - WebRTC voice signaling lifecycle.
