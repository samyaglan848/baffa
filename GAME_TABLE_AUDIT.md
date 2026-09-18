# BAFFA Game Table Audit

## Overview
This document serves as an audit of the current state of the BAFFA Game Table and Domino Engine prior to implementing the Prompt 8 requirements.

### 1. Server-Authoritative Engine & Dealing
- **Implemented:** The `DominoGameEngine` correctly generates a 28-tile double-six deck, shuffles it via the Fisher-Yates algorithm, and deals exactly 7 tiles to 4 players without duplication or leftover tiles (`deck.ts`).
- **Randomness:** Shuffling uses a standard PRNG and is done per round. Natural randomness is maintained without artificial "anti-repeat" adjustments.
- **Missing:** Formal tests verifying the specific dealing constraints requested in Prompt 8 (28 unique tiles, 7 per player, no leftovers, 6|6 starts, etc.).

### 2. Private Hand Security
- **Implemented:** `GameSessionService.getSanitizedState` correctly isolates hands. If the client is a `PLAYER`, they only receive their own hand. Opponents, Judges, and Spectators receive an empty array for hands and only the `hiddenTilesCount`.
- **Missing:** The frontend `GameTable.tsx` currently only displays a text string like `7 tiles` for opponents. It needs to visually render the backs of the dominoes dynamically based on `hiddenTilesCount`.

### 3. Gameplay Mechanics & Turns
- **Implemented:** Turn management (Counter-Clockwise), placing tiles (LEFT/RIGHT endpoints), passing (only when legal moves are 0), cheating declaration by Judge, blocked games, empty hand wins, and correct Egyptian rules.
- **Missing:** Minor visual polish (shaking animations are basic, turn indicator is text-based).

### 4. Player Hand UI & Domino Table
- **Implemented:** Central chain rendering and current player's hand rendering exist but are rudimentary.
- **Missing:**
  - Responsive, scrollable Domino chain to accommodate long sequences.
  - Face-down Domino graphics in `DominoTile.tsx`.
  - Proper animated placement from hand to chain.

### 5. Chat & Reactions
- **Implemented:** Bot chat messages exist via `BotChatMessage`.
- **Missing:** 
  - Real-time Quick Chat (predefined phrases).
  - Emoji Reaction system.
  - Room Admin controls to toggle Quick Chat and Reactions (needs addition to `RoomSettings` interface).
  - Web/Server socket handlers for these new chat features.

### 6. Summary of Action Items
- Add `isFaceDown` rendering capability to `DominoTile.tsx`.
- Refactor `GameTable.tsx` layout to visually stack face-down tiles for opponents (North, East, West).
- Introduce Quick Chat & Emoji Reactions UI and Socket events.
- Update `RoomSettings` interface to include chat/reaction toggles.
- Build extensive dealing/randomness unit tests (`dealing.spec.ts`).
- Polish UI animations and responsive handling on mobile.
