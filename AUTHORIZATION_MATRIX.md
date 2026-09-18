# BAFFA (بَفّة) — FORMAL AUTHORIZATION MATRIX

**System**: BAFFA Egyptian Multiplayer Domino Platform  
**Version**: 1.0.0 (Prompt 4 Hardened)  
**Classification**: Real-Time Multi-Role RBAC Model  
**Roles Defined**:
1. **Unauthenticated User / Guest** (`GUEST`)
2. **Authenticated Player** (`PLAYER`)
3. **Room Administrator** (`ADMIN`)
4. **Designated Judge** (`JUDGE`)
5. **Spectator** (`SPECTATOR`)
6. **AI Bot / Server Agent** (`BOT`)

---

## 1. Role Definitions & Access Scopes

| Role | Description | Hand Access | Scoring Authority | Turn Action Authority |
|---|---|---|---|---|
| **GUEST** | Unregistered or anonymous web visitor; assigned isolated `guest_<id>` namespace. | None until seated | None | None |
| **PLAYER** | Authenticated or seated participant occupying Seats 0, 1, 2, or 3. | Own hand ONLY (7 tiles) | None (Server computes) | Active on turn only |
| **ADMIN** | Room creator or designated room owner; seated in Seat 0 (or transferred). | Own hand ONLY | None | Active on turn + Lobby Controls |
| **JUDGE** | Non-playing referee presiding over room (Max 1 per room). | Zero private hands | Can report cheating | None |
| **SPECTATOR** | Non-playing observer watching match (Max 1 per room). | Zero private hands | None | None |
| **BOT** | Authoritative server agent executing legal moves for Egyptian AI personas. | Own hand ONLY | None | Server triggered on turn |

---

## 2. Real-Time Socket.IO Event Authorization Matrix

| Socket.IO Event | GUEST | PLAYER | ADMIN | JUDGE | SPECTATOR | BOT | Enforcement Mechanism |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| `CREATE_ROOM` | ALLOWED | ALLOWED | ALLOWED | DENIED | DENIED | DENIED | Handshake / Gateway validation |
| `JOIN_ROOM` | ALLOWED* | ALLOWED* | ALLOWED* | DENIED | DENIED | DENIED | Blocked if match in progress (`PLAYING`) unless reconnecting to held seat |
| `JOIN_AS_JUDGE` | DENIED | ALLOWED | ALLOWED | ALLOWED | DENIED | DENIED | Room `allowJudge: true` & Max 1 limit check |
| `JOIN_AS_SPECTATOR` | ALLOWED | ALLOWED | ALLOWED | DENIED | ALLOWED | DENIED | Room `allowSpectator: true` & Max 1 limit check |
| `SELECT_SEAT` | ALLOWED* | ALLOWED | ALLOWED | DENIED | DENIED | DENIED | Lobby status only; Seat range `[0, 3]`; cannot steal occupied human seat |
| `ADMIN_MOVE_SEAT` | DENIED | DENIED | ALLOWED | DENIED | DENIED | DENIED | `room.currentAdminId === caller.userId` && `status === 'LOBBY'` |
| `ADMIN_TOGGLE_BOT` | DENIED | DENIED | ALLOWED | DENIED | DENIED | DENIED | `room.currentAdminId === caller.userId` && `status === 'LOBBY'` |
| `ADMIN_UPDATE_SETTINGS`| DENIED | DENIED | ALLOWED | DENIED | DENIED | DENIED | `room.currentAdminId === caller.userId` && `status === 'LOBBY'` |
| `ADMIN_START_MATCH` | DENIED | DENIED | ALLOWED | DENIED | DENIED | DENIED | `room.currentAdminId === caller.userId` && 4 seats occupied |
| `PLAY_TILE` | DENIED | ALLOWED* | ALLOWED* | DENIED | DENIED | SERVER | Must be caller's turn, tile in hand, valid domino connection, match `PLAYING` |
| `PASS_TURN` | DENIED | ALLOWED* | ALLOWED* | DENIED | DENIED | SERVER | Must be caller's turn, zero legal moves in hand, match `PLAYING` |
| `JUDGE_REPORT_CHEATING`| DENIED | DENIED | DENIED | ALLOWED | DENIED | DENIED | `caller.role === 'JUDGE'` && `room.judge.userId === caller.userId` && match `PLAYING` |
| `REQUEST_NEXT_ROUND` | DENIED | ALLOWED | ALLOWED | DENIED | DENIED | DENIED | Must be seated room participant && `status === 'ROUND_FINISHED'` |
| `REMATCH_REQUEST` | DENIED | DENIED | ALLOWED | DENIED | DENIED | DENIED | `room.currentAdminId === caller.userId` && `status === 'MATCH_FINISHED'` |
| `VOICE_SIGNAL` | DENIED | ALLOWED* | ALLOWED* | ALLOWED* | ALLOWED* | DENIED | Caller in room && `room.settings.voiceEnabled === true` |
| `VOICE_MUTE` | DENIED | ALLOWED* | ALLOWED* | ALLOWED* | ALLOWED* | DENIED | Caller in room && `room.settings.voiceEnabled === true` |
| `APP_VISIBILITY_CHANGED`| ALLOWED | ALLOWED | ALLOWED | ALLOWED | ALLOWED | DENIED | Advisory telemetry only; never triggers automatic bans |

*\*Allowed subject to preconditions (e.g. room membership, lobby state, seated status).*

---

## 3. REST API Endpoint Authorization Matrix

| Endpoint | Method | Public / Guest | Authenticated Player | Admin | Operations | Constraints |
|---|:---:|:---:|:---:|:---:|---|---|
| `/api/auth/register` | `POST` | ALLOWED | ALLOWED | ALLOWED | CREATE User, Profile | Rate limited per IP (10/min); enforces unique username/email/phone |
| `/api/auth/login` | `POST` | ALLOWED | ALLOWED | ALLOWED | READ User, CREATE Token | Rate limited (10/min); generic error message (anti-enumeration) |
| `/api/auth/google` | `POST` | ALLOWED | ALLOWED | ALLOWED | CREATE / READ User | Decodes verified token payload; prevents account hijacking |
| `/api/auth/refresh` | `POST` | ALLOWED | ALLOWED | ALLOWED | CREATE New Token Pair | Rotates access & refresh tokens with expiry validation |
| `/api/auth/me` | `GET` | ALLOWED | ALLOWED | ALLOWED | READ Auth Profile | Validates JWT Bearer header |
| `/api/matches/history` | `GET` | ALLOWED | ALLOWED | ALLOWED | READ Match History | Public metadata only; zero private hands; clamped pagination (`limit <= 50`) |
| `/api/matches/details/:id`| `GET`| ALLOWED | ALLOWED | ALLOWED | READ Match Timeline | Public events and round summaries only; zero secret hand exposure |
| `/api/matches/profile/:id`| `GET`| ALLOWED | ALLOWED | ALLOWED | READ Profile Info | Safe public profile fields |
| `/api/matches/stats/:id` | `GET`| ALLOWED | ALLOWED | ALLOWED | READ Aggregated Stats | Human vs Bot win/loss separation; streak totals |
| `/api/matches/head-to-head`| `GET`| ALLOWED | ALLOWED | ALLOWED | READ Matchup Analytics | Shared completed matches between two players |

---

## 4. Real-Time State Sanitization & Information Isolation Matrix

| Field in `SanitizedGameState` | Player (Seated) | Opponent Player | Judge | Spectator |
|---|:---:|:---:|:---:|:---:|
| `matchId`, `roomId`, `status` | Full Read | Full Read | Full Read | Full Read |
| `targetScore`, `roundNumber` | Full Read | Full Read | Full Read | Full Read |
| `team1Score`, `team2Score` | Full Read | Full Read | Full Read | Full Read |
| `currentTurnSeat`, `starterSeat` | Full Read | Full Read | Full Read | Full Read |
| `chain` (Table domino tiles) | Full Read | Full Read | Full Read | Full Read |
| `players[i].hiddenTilesCount` | Full Read | Full Read | Full Read | Full Read |
| `players[i].hand` / `tiles` | **OMITTED** | **OMITTED** | **OMITTED** | **OMITTED** |
| `myHand` | **Own hand ONLY** | **Empty `[]`** | **Empty `[]`** | **Empty `[]`** |
| `myLegalMoves` | **Own moves ONLY** | **Empty `[]`** | **Empty `[]`** | **Empty `[]`** |
| `canPass` | **Computed for Turn**| **`false`** | **`false`** | **`false`** |
| `lastRoundResult` | Full Read | Full Read | Full Read | Full Read |
| `cheatingEvent` | Full Read | Full Read | Full Read | Full Read |

---

## 5. Summary of Authoritative Guarantees

1. **Zero Client-Side Trust**: Client never submits scores, winners, tile ownership, or turn succession.
2. **Deterministic Role Segregation**: Non-admins cannot manipulate room settings; non-judges cannot penalize cheating; spectators cannot affect gameplay.
3. **Information Isolation**: Network payloads are filtered server-side prior to serialization; hidden tiles never reach unauthorized clients.
