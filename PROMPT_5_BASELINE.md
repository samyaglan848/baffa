# BAFFA (بَفّة) — PROMPT 5 BASELINE AUDIT

**Date**: August 28, 2026  
**Auditor**: Multi-Disciplinary QA & Senior Product Engineering Team  
**Scope**: Complete Frontend Experience, Egyptian Domino Rules, Mobile Viewports, Accessibility, Navigation, Realtime Sockets

---

## 1. Existing Screens & Navigation Structure

| Screen / View | Route / Component | Primary Actions | State & Data Dependencies |
|---|---|---|---|
| **Home / Play Screen** | `apps/web/src/components/home/HomeScreen.tsx` | Quick Play, Create Room, Join Room, Game Rules modal, Auth trigger | Socket connection, `currentUser` from localStorage |
| **Room Lobby** | `apps/web/src/components/room/RoomLobby.tsx` | Seat selection (North, East, South, West), Admin swap seats, Toggle bots, Change bot roster, Update target score (101/151), Join as Judge, Join as Spectator, Start match | `room` state from Socket.IO `ROOM_SYNC` |
| **Game Table** | `apps/web/src/components/game/GameTable.tsx` | Play tile, Pass turn ("فوت"), Select chain end, View live scoreboard, Voice controls, Judge cheating declaration, Next round trigger, Rematch trigger | `gameState` from Socket.IO `GAME_STATE_SYNC`, WebRTC voice peers |
| **Match History** | `apps/web/src/components/history/MatchHistoryScreen.tsx` | View paginated match list, open Match Details modal | REST API `/api/matches/history` |
| **Statistics** | `apps/web/src/components/statistics/StatisticsScreen.tsx` | View user stats (win rate, streaks, human vs bot separation) | REST API `/api/matches/stats/:userId` |
| **Profile** | `apps/web/src/components/profile/ProfileScreen.tsx` | View profile info, badges, head-to-head matchup modal | REST API `/api/matches/profile/:userId` |
| **Settings Modal** | `apps/web/src/components/settings/SettingsModal.tsx` | Audio volume slider, Voice toggle, Reduced motion toggle, Logout | Local state / localStorage |
| **Auth Modal** | `apps/web/src/components/auth/AuthModal.tsx` | Register, Login, Google OAuth | REST API `/api/auth/register`, `/api/auth/login`, `/api/auth/google` |

---

## 2. Existing Socket.IO Events & API Integrations

### Socket.IO Client Events:
- `CREATE_ROOM`, `JOIN_ROOM`, `JOIN_AS_JUDGE`, `JOIN_AS_SPECTATOR`
- `SELECT_SEAT`, `ADMIN_MOVE_SEAT`, `ADMIN_TOGGLE_BOT`, `ADMIN_UPDATE_SETTINGS`, `ADMIN_START_MATCH`
- `PLAY_TILE`, `PASS_TURN`, `JUDGE_REPORT_CHEATING`, `REQUEST_NEXT_ROUND`, `REMATCH_REQUEST`, `LEAVE_ROOM`
- `VOICE_SIGNAL`, `VOICE_MUTE`, `APP_VISIBILITY_CHANGED`

### Socket.IO Server Events:
- `ROOM_SYNC`, `GAME_STATE_SYNC`, `ROOM_ERROR`, `MOVE_REJECTED`, `BOT_MESSAGE`, `NOTIFICATION`, `DISCONNECT_GRACE_UPDATE`, `REMATCH_STARTED`, `STATS_UPDATED`, `VOICE_SIGNAL`, `VOICE_PEERS_SYNC`

### REST Endpoints:
- `/api/auth/register`, `/api/auth/login`, `/api/auth/google`, `/api/auth/refresh`, `/api/auth/me`
- `/api/matches/history`, `/api/matches/details/:matchId`, `/api/matches/profile/:userId`, `/api/matches/stats/:userId`, `/api/matches/head-to-head`

---

## 3. Baseline Test Suite Status

- **Engine Test Suite (`@baffa/engine`)**: 28 / 28 Passed (100%)
- **Server Test Suite (`@baffa/server`)**: 27 / 27 Passed (100%)
- **Monorepo Total Tests**: 55 Passed, 0 Failed, 0 Regressions.
- **Production Build**: Verified with Next.js 14 and NestJS.

---

## 4. Identified Areas for Prompt 5 UX Polish & Product Hardening

1. **Egyptian Domino Terminology**: Ensure "فوت / عدي", "دوري", "خلص ورقه", "قفلة" are displayed consistently and prominently.
2. **Invalid Tile Move Feedback**: Add tactile visual shake and banner ("الحركة دي مينفعش") when an illegal tile is clicked during the player's turn.
3. **Bot Roster Completeness**: Ensure all 7 official bots (*السامي, القط, الرايق, التيتو, رقم واحد في العزبة, الهيما, الهوبا*) are selectable in Create Room presets and Lobby.
4. **Pre-Game Start Validation**: Provide explicit, friendly explanatory feedback when match start cannot be executed (e.g. fewer than 4 seats occupied).
5. **Mobile Responsiveness**: Optimize small screens (320px–412px portrait, 568px–915px landscape) to ensure zero tile clipping or horizontal overflow.
6. **Accessibility & Settings Persistence**: Persist sound volume, voice enabled, and reduced motion in `localStorage`.
7. **End-to-End User Journey Coverage**: Implement comprehensive automated scenarios (A through P) to validate the full player journey.
