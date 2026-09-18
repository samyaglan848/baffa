# BAFFA User Profile System Documentation

## 1. Overview & Architecture

The **BAFFA User Profile System** is a lightweight, secure, and production-grade social and competitive player profiling system tailored for the BAFFA Egyptian Dominoes platform.

It is structured into two core logical views:
1. **My Profile (Authenticated Owner View)**:
   - Full control over Display Name, Bio, Gender, Avatar selection, and custom photo upload.
   - Access to competitive performance statistics, match history, and security/account settings.
2. **Public Profile (Read-Only Sanitized View)**:
   - Accessible by any player clicking on a username or seat avatar.
   - Displays avatar, display name, `@username`, bio, member since date, and complete competitive statistics (matches, win rate, streaks, human vs. bot breakdown).
   - Head-to-head matchup record against the viewer.
   - **Zero exposure of private sensitive fields** (no email, phone, passwords, session tokens, or IP addresses).

---

## 2. Profile Data Model

| Field | Type | Description | Rules & Constraints |
|---|---|---|---|
| `id` | `String (UUID)` | Unique account identifier | System immutable |
| `username` | `String` | Unique login username | Lowercase alphanumeric, immutable identity |
| `displayName` | `String` | Display name shown on game table | 2 to 30 characters, HTML/XSS sanitized |
| `avatarUrl` | `String` | Active avatar URL or catalog ID | Points to custom URL or `avatar-1`..`avatar-12` |
| `avatarId` | `String?` | Selected BAFFA catalog avatar ID | Must exist in `BAFFA_AVATARS` |
| `customAvatarUrl` | `String?` | Uploaded custom image URL | Managed by `ProfileImageStorage` |
| `gender` | `Enum?` | Player gender preference | `'MALE'`, `'FEMALE'`, `'PREFER_NOT_TO_SAY'` |
| `bio` | `String?` | Short personal bio ("نبذة عني") | Maximum 160 characters, HTML/XSS sanitized |
| `createdAt` | `DateTime` | Account registration timestamp | System immutable |

---

## 3. Dual Avatar & Image Upload System

### Option A: The BAFFA Avatar Catalog
A curated set of 12 Egyptian coffeehouse-themed avatars:
1. `avatar-1`: **الدكتور (El-Doctor)** `👨‍⚕️` — حكيم الطاولة وحاسب البناط بالمللي
2. `avatar-2`: **الباشا (El-Basha)** `👑` — صاحب القعدة ولعبه دايماً على كبير
3. `avatar-3`: **المعلم (El-Maalem)** `🧔` — خبير الدومينو وقافل الدور بحرفنة
4. `avatar-4`: **الكابتن (El-Captain)** `🧢` — سريع البديهة وقائد فريقه للانتصار
5. `avatar-5`: **البرنس (El-Prince)** `🎩` — أناقة وهدوء وأعصاب من حديد
6. `avatar-6`: **الأسطى (El-Osta)** `🛠️` — فاهم التكتيك من أول رمة لآخر بلاطة
7. `avatar-7`: **الجوكر (El-Joker)** `🃏` — رمياته غير متوقعة ويفاجئ الخصوم
8. `avatar-8`: **الملكة (El-Maleka)** `👸` — سيدة الطاولة وتركيزها يقلب الماتش
9. `avatar-9`: **الهانم (El-Hanem)** `🧕` — ذكاء استراتيجي ولعب هادي وواثق
10. `avatar-10`: **الجنرال (El-General)** `🎖️` — انضباط صارم وحساب دقيق لكل خطوة
11. `avatar-11`: **الفنان (El-Fannan)** `🎨` — يرسم السلسلة بدقة ويمتع الجمهور
12. `avatar-12`: **الصقر (El-Saqr)** `🦅` — عينه على أوراق الخصوم وحركاته حاسمة

### Option B: Custom Profile Image Upload
- **Validation Pipeline**:
  - File Size: Maximum 2MB (2,097,152 bytes).
  - Magic Byte Detection: Inspects binary signatures for true JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`), and WebP (`RIFF...WEBP`).
  - Active Content Rejection: Scans for and rejects scripts, SVG payloads, executable headers, and PHP tags.
- **Storage Abstraction (`IProfileImageStorage`)**:
  - `LocalProfileStorage`: Writes to `uploads/avatars/${userId}_${timestamp}_${uuid}.${ext}`. Path traversal protected.
  - Extensible to Cloudflare R2 or AWS S3 by swapping provider injection in `AppModule`.
- **Reversion**: Deleting custom photo cleanly deletes file from disk and reverts `avatarUrl` to `avatarId`.

---

## 4. REST API Endpoints

### 1. `GET /api/profile/me`
- **Auth**: Bearer Token required.
- **Description**: Returns authenticated user's complete profile with stats.

### 2. `PATCH /api/profile/me`
- **Auth**: Bearer Token required.
- **Body**: `{ displayName?: string, bio?: string, gender?: string, avatarId?: string }`
- **Description**: Validates, sanitizes, and updates profile. Broadcasts `server:profile_updated`.

### 3. `POST /api/profile/me/avatar`
- **Auth**: Bearer Token required.
- **Body**: `{ imageBase64: string, mimeType?: string }` or binary buffer.
- **Description**: Validates image magic bytes, saves file, and updates profile picture.

### 4. `DELETE /api/profile/me/avatar`
- **Auth**: Bearer Token required.
- **Description**: Removes uploaded picture and resets to default avatar.

### 5. `GET /api/profile/public/:identifier`
- **Auth**: Public.
- **Description**: Returns sanitized `PublicUserProfile` for given username or UUID with stats and recent matches.

### 6. `GET /api/profile/head-to-head/:opponentId`
- **Auth**: Bearer Token required.
- **Description**: Calculates direct match history, win rates, and round statistics between requester and opponent.

---

## 5. Real-Time Synchronization

When a player updates their profile (display name, bio, avatar, or custom picture):
1. Server updates database and in-memory caches.
2. Server broadcasts `server:profile_updated` over Socket.IO with payload:
   ```json
   {
     "userId": "user_id",
     "username": "player_username",
     "displayName": "New Display Name",
     "avatarUrl": "avatar-2",
     "avatarId": "avatar-2",
     "customAvatarUrl": null,
     "bio": "Bio content...",
     "gender": "MALE"
   }
   ```
3. Connected clients in active lobbies and table seats update the player's avatar and name in real time without refreshing the page.

---

## 6. Automated Testing Suite

All 84 test assertions pass with 100% success rate:
- Unit & integration tests in `apps/server/src/tests/profile-production.spec.ts`.
- Zero regressions across existing authentication, anti-cheat, adversarial security, and gameplay suites.
