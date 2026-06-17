# 🧭 Project: Badminton LINE Booking System (MVP)

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| DB | Supabase (PostgreSQL) |
| Backend API | Vercel Serverless Functions (Node.js) |
| Cron | Vercel Cron Jobs |
| Frontend | Next.js + LIFF (LINE Frontend Framework) |
| Integration | LINE Messaging API Bot |

---

## 🎯 Goal (MVP)

Build a system that replaces LINE +1 / 請假 / 候補 manual management.

**Core features:**
- Fixed roster (season players)
- Leave management (請假)
- Waitlist (候補)
- Auto slot allocation (when someone leaves)
- LINE group auto updates
- Weekly scheduled reminders (Mon / Fri)

---

## 👤 User Stories

### 正式成員 (Roster Player)
- 我想要透過 LIFF 標記請假，讓系統自動通知候補者
- 我想要看到目前場次的出席清單，了解誰來誰不來
- 我想要收到 LINE 提醒，知道這次場次的安排

### 候補成員 (Waitlist Player)
- 我想要加入候補名單，當有人請假時自動遞補
- 我想要收到 LINE 通知，確認我被晉升為正式出席

### 管理員 (Admin)
- 我想要查看每次場次的完整出缺席狀況
- 我想要手動強制重算名單，處理異常情況

---

## 🧠 Business Rules

### Roster model
- Each session has a fixed roster (e.g. 16 people)
- If a player does NOT mark absence → they are considered attending

### Absence
- When a player marks leave:
  - Their status changes to `absent`
  - A slot opens
  - Reallocation triggers immediately

### Waitlist
- If slot opens:
  - First waitlist user (by `created_at` ASC) is promoted automatically
  - Promoted player receives LINE notification

### Priority order
1. **Roster** (default attending)
2. **Absent** (removes from active roster)
3. **Waitlist** (fills empty slots, FIFO)

### Capacity enforcement
- `active_count = capacity - absent_count`
- System never allows `roster` status count to exceed `capacity`
- Overflow attempts are rejected with an error

---

## 📦 Database Schema (Supabase)

### 1. `players`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| name | text | NOT NULL |
| line_user_id | text | UNIQUE, NOT NULL |
| created_at | timestamptz | default now() |

### 2. `sessions`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| date | date | NOT NULL |
| day_of_week | text | CHECK (Mon, Fri) |
| capacity | int | NOT NULL, default 16 |
| start_time | time | NOT NULL |
| location | text | |
| created_at | timestamptz | default now() |

### 3. `session_players`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| session_id | uuid | FK → sessions.id |
| player_id | uuid | FK → players.id |
| status | text | CHECK (roster, absent, waitlist) |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Unique constraint:** `(session_id, player_id)`

### 4. `groups`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| line_group_id | text | UNIQUE, NOT NULL |
| session_id | uuid | FK → sessions.id |
| label | text | |
| created_at | timestamptz | default now() |

### Indexes
```sql
CREATE INDEX idx_session_players_session ON session_players(session_id);
CREATE INDEX idx_session_players_player ON session_players(player_id);
CREATE INDEX idx_session_players_status ON session_players(session_id, status);
```

---

## ⚙️ Backend APIs (Vercel Serverless Functions)

### Authentication
All API calls from LIFF must include a LINE ID Token in the `Authorization: Bearer <id_token>` header. Server verifies the token against LINE's API to extract `line_user_id`.

### 1. `POST /api/leave`
Mark user as absent and trigger reallocation.

**Request:**
```json
{ "session_id": "uuid" }
```

**Response:**
```json
{
  "success": true,
  "promoted_player": { "name": "Alice", "line_user_id": "U..." } | null
}
```

**Logic:**
1. Verify LINE token → get `line_user_id`
2. Find `session_players` record
3. If already `absent` → return 200 (idempotent)
4. Set status → `absent`
5. Call `recalculate(session_id)`
6. Send LINE notifications

### 2. `POST /api/join`
Join as roster (if slots available) or auto-redirect to waitlist.

**Request:**
```json
{ "session_id": "uuid" }
```

**Response:**
```json
{
  "success": true,
  "status": "roster" | "waitlist"
}
```

**Logic:**
1. Verify LINE token
2. Upsert `session_players` record
3. If `active_count < capacity` → status = `roster`
4. Else → status = `waitlist`
5. Send LINE notification

### 3. `POST /api/waitlist`
Explicitly join waitlist (skip roster check).

**Request:**
```json
{ "session_id": "uuid" }
```

**Response:**
```json
{ "success": true, "position": 3 }
```

### 4. `POST /api/recalculate`
Idempotent recompute of roster. Safe to call multiple times.

**Request:**
```json
{ "session_id": "uuid" }
```

**Logic:**
1. Count `absent` in session
2. `open_slots = absent_count`
3. Promote `waitlist` players (FIFO by `created_at`) up to `open_slots`
4. Return updated state

### 5. `POST /api/line/webhook`
Receive LINE Bot events (messages, follows, group joins).

**Handled events:**
- `message` — user types commands (join / leave / status)
- `follow` — user added bot as friend
- `memberJoined` — track group members

**Verification:** Validates `X-Line-Signature` header using `LINE_CHANNEL_SECRET`.

### 6. `GET /api/session/:id`
Fetch current session status for LIFF display.

**Response:**
```json
{
  "session": { "id": "...", "date": "2026-06-22", "capacity": 16 },
  "roster": [{ "name": "Alice", "status": "roster" }],
  "absent": [...],
  "waitlist": [...],
  "available_slots": 3
}
```

---

## 🤖 LINE Bot Responsibilities

- Send weekly reminders (Mon / Fri morning)
- Post session status updates to group
- Notify when:
  - User leaves (請假)
  - User joins (加入)
  - Waitlist player is promoted (晉升)
- Store `groupId` mapping to sessions
- Accept inline commands: `join`, `leave`, `status`, `waitlist`

### Message Templates

**Weekly Reminder (Mon/Fri):**
```
🏸 本週羽球場次提醒

📅 日期：週五 2026/06/19
📍 地點：XXX 球館
🕗 時間：XX:XX

目前出席：13/16
候補人數：1

出席 / 請假 / 候補：
<LIFF_URL>
```

**Leave Notification:**
```
🔔 出席更新

Alice 已請假
Bob 從候補晉升為出席！

目前出席：13/16
```

---

## ⏰ Cron Jobs (Vercel)

### 1. Weekly Reminder
- Schedule: `0 7 * * 1,5` (7:00 AM every Mon & Fri)
- Action: POST session status to all linked LINE groups

### 2. Pre-game Reminder
- Schedule: 1 hour before session `start_time`
- Action: Final attendance summary to group

### `vercel.json` config:
```json
{
  "crons": [
    { "path": "/api/cron/weekly-reminder", "schedule": "0 7 * * 1,5" },
    { "path": "/api/cron/pregame-reminder", "schedule": "0 6 * * 1,5" }
  ]
}
```

---

## 📱 LIFF Frontend (Next.js)

### Pages

#### 1. `/` — Session Page
- Show current upcoming session
- Display: date, location, time, roster count / capacity
- Buttons: **Join** / **Leave** / **Waitlist**
- Button state based on user's current status
- Disabled states: already joined, already left, already waitlisted

#### 2. `/status` — Status Page
- Roster list (with player names)
- Absent list
- Waitlist (with position numbers)
- Real-time refresh on mount

### LIFF Init Flow
```ts
liff.init({ liffId: LIFF_ID })
  .then(() => {
    if (!liff.isLoggedIn()) liff.login()
    const profile = await liff.getProfile()
    // use profile.userId for all API calls
  })
```

---

## 🔁 Core Logic

### Reallocation Logic
```ts
async function recalculate(sessionId: string) {
  const absentCount = await countByStatus(sessionId, 'absent')
  const openSlots = absentCount
  const waitlist = await getWaitlist(sessionId) // ORDER BY created_at ASC

  const toPromote = waitlist.slice(0, openSlots)
  for (const player of toPromote) {
    await updateStatus(player.id, 'roster')
    await sendLineNotification(player.line_user_id, '您已從候補晉升為出席！')
  }
}
```

### Slot Calculation
```
available_slots = capacity - count(status = 'roster')
```

---

## 🚨 Edge Cases

| Case | Handling |
|---|---|
| User joins twice | Upsert on `(session_id, player_id)` — idempotent, return current status |
| User leaves twice | Check existing status, return 200 if already absent |
| Waitlist promotion duplication | DB unique constraint + transaction prevents double insert |
| Roster overflow | Pre-check `active_count < capacity` before setting `roster` |
| Inconsistent state | `/api/recalculate` always recomputes from DB ground truth |
| LINE token invalid | Return 401, LIFF re-initiates login |
| Webhook replay | Log processed `deliveryContext.isRedelivery`, skip if true |

---

## 🔐 Security

- LINE ID Token verified server-side on every API call (never trust client-sent `userId`)
- Webhook signature validated with `LINE_CHANNEL_SECRET` via HMAC-SHA256
- Supabase `SUPABASE_SERVICE_ROLE_KEY` never exposed to frontend
- LIFF only uses `SUPABASE_ANON_KEY` through backend — no direct DB access from client
- Environment variables managed via Vercel project settings

---

## 🌍 Non-Functional Requirements

| Requirement | Target |
|---|---|
| API response time | < 500ms p95 |
| Reallocation latency | < 2s after leave action |
| LINE notification delivery | Best-effort, no retry required for MVP |
| Availability | Vercel managed, no SLA required for MVP |
| Concurrent users | < 50 (single group MVP) |
| DB connections | Supabase connection pooling (default) |

---

## 🚀 Deployment Setup

### Environment Variables (Vercel)
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LIFF_ID=
NEXT_PUBLIC_LIFF_ID=
NEXT_PUBLIC_API_BASE_URL=
```

### LINE Developer Console Setup
1. Create a Messaging API channel
2. Set webhook URL: `https://<vercel-domain>/api/line/webhook`
3. Enable webhook, disable auto-reply
4. Create LIFF app under the same channel, set endpoint URL

### Supabase Setup
1. Create project
2. Run migration SQL for all tables
3. Enable Row Level Security (RLS) — service role bypasses for API, anon key blocked from direct writes

---

## ❗ Required Credentials (Before Implementation)

Claude MUST ask for the following before coding:

1. **Supabase credentials**
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **LINE Bot credentials**
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`

3. **LINE Group info**
   - `line_group_id` (for target group)

4. **LIFF setup**
   - `LIFF_ID`
   - `LIFF_URL` domain

5. **Scheduling preference**
   - Exact cron timing (e.g. 7:00 AM Mon/Fri?)
   - Session `start_time` and `location`
   - Session `capacity` (default 16?)

---

## 🚫 Out of Scope (MVP)

- Payment / 收費功能
- Multi-group / multi-session management UI
- Admin dashboard
- Player statistics / history
- Recurring session auto-generation
- iOS/Android native app
- Email notifications

---

## ✅ Definition of Done

- [ ] Users can join / leave / waitlist from LIFF
- [ ] System auto reallocates slots on leave
- [ ] LINE group receives real-time updates
- [ ] Cron sends Mon/Fri reminders automatically
- [ ] No manual +1 needed anymore
- [ ] Edge cases handled (double join/leave, overflow)
- [ ] LINE token verification working end-to-end
- [ ] Deployed to Vercel with all env vars configured

---

## 💡 Implementation Notes

- Supabase is single source of truth — never derive state from LINE
- Vercel functions must be stateless — no in-memory caching
- All state recalculation must be idempotent — safe to retry
- LINE bot is only a notifier + event receiver, not a state store
- Use DB transactions for reallocation to prevent race conditions
