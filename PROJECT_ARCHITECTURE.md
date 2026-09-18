# BAFFA (بَفّة) — Technical & Product Architecture

## 1. Executive Summary & Product Identity

**BAFFA (بَفّة)** is a high-performance, real-time multiplayer Egyptian domino gaming platform engineered for scale, responsiveness, and cross-platform compatibility (Web PWA, Android, and iOS).

### Brand Identity Principles:
- **Intelligent Dual-Language Presentation**: Never permanently glued as `BAFFA | بَفّة`. Distinct screens and navigation elements employ "BAFFA" (English) or "بَفّة" (Arabic) contextually.
- **Single Sophisticated Visual Mode**: Combines deep obsidian dark backgrounds (`#06090E`, `#0B111A`), clean illuminated surfaces (`#121D2D`, `#1A283E`), Egyptian Sun Gold accents (`#F59E0B`, `#FBBF24`), and Nile Turquoise (`#06B6D4`).
- **Tactile Egyptian Domino Visuals**: Custom ivory/resin domino tiles with center dividers, brass spinner dots, and realistic indented pips.
- **Subtle Creator Signature**: *"Made with love by Samy"*.

---

## 2. Monorepo Structure

```
baffa/
├── docker-compose.yml              # PostgreSQL 16 & Redis 7 container configuration
├── tsconfig.base.json              # Shared TypeScript base configuration
├── package.json                    # Monorepo workspaces definition
├── PROJECT_ARCHITECTURE.md         # Full architectural documentation
├── PROJECT_HANDOFF.md              # Delivery documentation & Prompt 2 handoff
│
├── packages/
│   ├── shared/                     # Shared DTOs, Socket.IO event contracts, types
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── domino.ts       # Domino tiles, chain, seats, scores, states
│   │   │   │   ├── room.ts         # Room settings, seating info, presences
│   │   │   │   ├── events.ts       # ClientEvents & ServerEvents typed payloads
│   │   │   │   └── auth.ts         # User profiles and authentication DTOs
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── engine/                     # Server-Authoritative Domino Game Engine
│       ├── src/
│       │   ├── deck.ts             # 28 unique tiles generation, Fisher-Yates shuffle
│       │   ├── chain.ts            # Domino chain manager (ends, doubles, placements)
│       │   ├── rules.ts            # 6|6 start, counter-clockwise turns, legal moves
│       │   ├── scoring.ts          # Empty-hand & Blocked game (قفلة) calculations
│       │   ├── engine.ts           # State machine & sanitized masked state generator
│       │   └── index.ts
│       └── tests/
│           └── engine.spec.ts      # Comprehensive automated unit tests
│
└── apps/
    ├── server/                     # NestJS Real-Time WebSocket Backend
    │   ├── prisma/
    │   │   └── schema.prisma       # PostgreSQL schema (User, Profile, Room, Match, Round)
    │   ├── src/
    │   │   ├── gateways/
    │   │   │   └── game.gateway.ts # Real-time Socket.IO gateway
    │   │   ├── modules/
    │   │   │   ├── game/           # Game session orchestrator & Bot engine
    │   │   │   ├── room/           # Room seating and admin controls
    │   │   │   └── match/          # Match persistence & REST endpoints
    │   │   └── main.ts
    │   └── package.json
    │
    └── web/                        # Next.js Frontend Web Application
        ├── src/
        │   ├── app/                # App router (layout.tsx, page.tsx)
        │   ├── components/
        │   │   ├── common/         # DominoTile tactile component
        │   │   ├── game/           # GameTable, DominoChainView, PlayerSeatBadge
        │   │   ├── room/           # RoomLobby, CreateRoomModal, JoinRoomModal
        │   │   ├── home/           # HomeScreen landing view
        │   │   └── layout/         # Navbar, Footer ("Made with love by Samy")
        │   ├── hooks/
        │   │   └── useGameSocket.ts# Typed real-time React hook
        │   └── styles/
        │       ├── tokens.css      # Centralized BAFFA Design System tokens
        │       └── globals.css     # Micro-animations, responsive layout styles
        └── package.json
```

---

## 3. Core Game Engine & Rule Specifications

### 3.1 28 Tiles & Complete Dealing
- Exact 28 tiles from `0|0` to `6|6`.
- 4 players receive exactly 7 tiles each. No tiles remain undealt.

### 3.2 Strict Counter-Clockwise Progression
- Turn order moves strictly counter-clockwise:
  `South (Seat 0) -> East (Seat 1) -> North (Seat 2) -> West (Seat 3) -> South (Seat 0)`.

### 3.3 Round 1 Starter & Future Rounds
- Round 1: Strictly the player holding `6|6` (الدوش).
- Subsequent rounds: Extensible starter handler defaulting to previous round winner.

### 3.4 2v2 Teams & Opposite Seating
- Seats 0 & 2 = **Team 1** (Crimson).
- Seats 1 & 3 = **Team 2** (Sky Cyan).
- Partners sit directly opposite each other.

### 3.5 Pass ("فوت" / "عدي") & Blocked Game ("قفلة")
- A player may pass if and only if `legalMoves.length === 0`.
- When all 4 players consecutively pass -> Round enters **Blocked Game ("قفلة")**.
- Lowest team pip sum wins the round; winning team is awarded the opposing team's remaining pips.

### 3.6 Match Targets
- Configurable match targets: **101** or **151** points.

---

## 4. Security & Anti-Cheat Foundation

### Principle: "NEVER TRUST THE CLIENT"
1. **Authoritative Server State**: Shuffling, dealing, move verification, pass legality, and score calculations take place exclusively on the server.
2. **Private Hand Sanitization**: Opponent tiles are masked before network dispatch (`hiddenTilesCount`). A client's WebSocket payload only contains their own hand.
3. **Database Constraints**: Unique username, normalized identifiers, atomic seat locking.

---

## 5. Extensibility & Future Phases

- **Prompt 2 (Real-Time Voice, Anti-Cheat, Judges, Spectators)**:
  - `apps/server/src/gateways` structured to support WebRTC signaling.
  - Spectator seat observer pattern ready in `RoomService`.
  - Rate limiting & timing anti-cheat hooks.
- **Prompt 3 (Mobile Apps, Replay System, Monetization)**:
  - Pure decoupled engine in `packages/engine` can be run in React Native / Flutter / Kotlin / Swift or consumed via existing APIs.
  - Serialized `GameEvent` logs allow full deterministic match replays.
