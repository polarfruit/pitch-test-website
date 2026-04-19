# Organiser Dashboard Section Map

Reference for the `/organiser-dashboard` migration phase.
Source: `pages/organiser-dashboard.html` (5,190 lines)

---

## File Structure Overview

| Section | Line Range |
|---------|------------|
| CSS (`<style>` block) | 1–780 |
| Loading overlay | 783–792 |
| Announcement banner | 794–802 |
| Sidebar navigation | 804–839 |
| Topbar + notification bell | 842–861 |
| All 11 panel containers | 866–1736 |
| Rate Vendor modal | 1741–1783 |
| Delete Account modal | 1785–1798 |
| Broadcast Message modal | 1800–1812 |
| JavaScript (main block) | 1814–5170 |
| Location autocomplete init script | 5171–5188 |

---

## 11 Panels

### 1. Overview (panel-overview)

**HTML:** Lines 866–906
**JS:** `initDashboard()` ~1870, `loadOrgOverview()` ~3225, `renderOrgOverview()` ~3250, `quickApproveApp()` ~3320

**Data displayed:**
- 4 stat cards: Live Events, Total Applications, Avg Fill Rate, Vendors Approved
- Upcoming events list (next 3, with date + fill rate)
- Recent applications queue (latest 5, with vendor name + event + status)
- Pending ratings banner (post-event prompt to rate vendors)

**API endpoints:**
- Auth data injected server-side via `window.__PITCH_USER__`, `window.__PITCH_PROFILE__`, `window.__PITCH_INIT_DATA__`
- `GET /api/organiser/overview` — stat cards + upcoming events + recent applications
- `GET /api/organiser/pending-ratings` — pending vendor rating prompts

**User interactions:**
- Click upcoming event → `openEventMgmt(id, name)`
- Click application → review inline
- Quick approve button on application cards → `quickApproveApp(id)`
- Click pending ratings banner → navigates to Vendor Ratings panel

---

### 2. My Events (panel-events)

**HTML:** Lines 908–935
**JS:** `loadOrgEvents()` ~3360, `renderOrgEventsData()` ~3380

**Data displayed:**
- Events table: Event name, Date, Spots (filled/total), Fill rate (%), Status badge, Applications count, Actions column
- Empty state CTA: "Post your first event" button

**API endpoints:**
- `GET /api/organiser/events` — all organiser events

**User interactions:**
- Click event row → `openEventMgmt(id, name)` (opens Event Management panel)
- Click "Post an Event" CTA → `showPanel('new-event')`
- Status badges: live (green), draft (grey), past (muted), archived (strikethrough)

---

### 3. Event Management (panel-event-mgmt)

**HTML:** Lines 937–1008
**JS:** `openEventMgmt()` ~2200, `reviewApp()` ~2350, `showTab()` ~2280, `filterMgmtApps()` ~2400, `saveEventDetails()` ~2500, `toggleArchiveEvent()` ~2600, `deleteEventConfirm()` ~2630, `markAttendance()` ~4849

**Data displayed (4 tabs):**

**Tab: Applications**
- Filter row: All / Pending / Approved / Rejected
- Application cards: vendor avatar, trading name, cuisine, plan tier, suburb, message preview, applied date
- Approve / Decline / Message action buttons per card

**Tab: Lineup**
- Approved vendor table: Vendor name, Cuisine, Spot assignment (editable input), Attendance tracking (showed / no-show buttons)
- Attendance state persists via API

**Tab: Details**
- Editable event form: name, category, date, suburb, state, venue, attendance estimate, website, description, spots, booth size, power, water, fee range, setup/packdown times
- Save / Archive / Delete buttons
- Location autocomplete on suburb and venue fields (re-initialised via `pitchLocAC`)

**Tab: Analytics**
- Per-event KPIs: applications received, fill rate, revenue collected, vendor breakdown

**API endpoints:**
- `GET /api/organiser/events/{id}/applications` — applications for specific event
- `PATCH /api/organiser/applications/{id}/status` — approve/decline application
- `PATCH /api/organiser/events/{id}` — update event details
- `PATCH /api/organiser/events/{id}/status` — archive/unarchive event
- `DELETE /api/organiser/events/{id}` — delete event (with confirmation)
- `POST /api/organiser/mark-attendance` — mark vendor attendance (showed/no-show)

**User interactions:**
- Tab switching via `showTab(tabName)`
- Filter applications by status
- Approve/decline applications with inline status update
- Edit event details + save
- Archive/unarchive toggle
- Delete event (confirmation dialog)
- Mark vendor attendance (showed / no-show toggle buttons)
- Message vendor → opens Messages panel with thread

---

### 4. Post an Event (panel-new-event)

**HTML:** Lines 1010–1280
**JS:** `goStep()` ~2700, `validateStep1()` ~2730, `validateStep3()` ~2780, `populateReview()` ~2800, `publishEvent()` ~2850, `neCal` (calendar system) ~3000, `loadPlatformLimits()` ~2100, `validateSpotsInput()` ~2130, `checkSpotsLimit()` ~2150

**Data displayed:**
- 5-step wizard with progress indicator (steps 1–5 highlighted)

**Step 1 — Basics:**
- Event name, Category (dropdown), Date (calendar date picker), Suburb (autocomplete), State (dropdown), Venue (autocomplete), Expected attendance, Website, Description (textarea)

**Step 2 — Booth Specs:**
- Number of stalls (validated against platform limit `_maxStallsPerEvent`), Booth size (dropdown), Power available (toggle), Water available (toggle), Fee range (min/max), Setup time, Packdown time

**Step 3 — Requirements:**
- Cuisine tags (multi-select checkboxes), Application deadline (calendar picker), Exclusivity toggle, "Looking for" text, Custom requirements textarea

**Step 4 — Terms:**
- Cancellation policy (dropdown), Payment terms (dropdown)

**Step 5 — Review:**
- Full summary of all fields with "Edit" buttons per section
- Missing-field warnings highlighted in red
- "Publish Event" button

**API endpoints:**
- `POST /api/organiser/events` — create new event
- `GET /api/platform-limits` — max stalls per event, max events per org

**User interactions:**
- Step navigation: Next / Back buttons with validation gates
- Calendar date picker popup (custom `neCal` system) for event date and deadline
- Location autocomplete on suburb and venue
- Cuisine tag selection (checkbox grid)
- Spots input validated against platform tier limit
- Publish submits all data → redirects to My Events on success

**Platform limits:**
- `_maxStallsPerEvent` — enforced on spots input (Step 2)
- `_maxEventsPerOrg` — checked before showing form (redirects if at limit)

---

### 5. Messages (panel-messages)

**HTML:** Lines 1282–1318
**JS:** `startChat()` ~3500, `openChatWindow()` ~3530, `renderOrgMessages()` ~3600, `renderThreadSidebar()` ~3560, `loadOrgAllThreads()` ~3450, `sendMsg()` ~3680, `startOrgMsgPoll()` ~3720, `stopOrgMsgPoll()` ~3740

**Data displayed:**
- Thread sidebar: list of conversations with sender name, last message preview, unread badge, timestamp
- Conversation area: message bubbles (sent/received), timestamps, typing indicator, online status dot
- Compose bar: text input + send button

**API endpoints:**
- `GET /api/messages` — all threads for current user
- `GET /api/messages/{threadKey}` — messages in a specific thread
- `POST /api/messages/{threadKey}` — send message to thread
- `POST /api/messages` — start new thread

**User interactions:**
- Click thread in sidebar → loads conversation
- Type + send message (Enter key or send button)
- Real-time polling every 8 seconds (`startOrgMsgPoll`)
- Polling stops when navigating away from Messages panel (`stopOrgMsgPoll`)
- Announcement threads rendered differently (system messages)

---

### 6. Settings (panel-settings)

**HTML:** Lines 1320–1560
**JS:** `initOrgSettingsPanel()` ~3800, `saveOrgSettings()` / `saveOrgAccount()` ~3830, `previewAndUploadAvatar()` ~3870, `uploadOrgBanner()` ~3900, `saveOrgNotifSettings()` ~3950, `toggleOrgPause()` ~3980, `showDeleteOrgModal()` ~4000, `closeDeleteOrgModal()` ~4010, `confirmDeleteOrgAccount()` ~4020, `saveOrgDefaults()` ~4060, `saveOrgTimezone()` ~4080, `setOrgTimeFormat()` ~4100, `saveOrgAutoResponse()` ~4120, `_orgAbnAutoTrigger()` ~3160, `orgVerifyAbn()` ~3170, `orgAbnMatchBadge()` ~3190, `orgAbnHydrateStored()` ~3210

**Data displayed (11 sub-sections):**

1. **Profile Picture + Banner** — avatar upload (preview + crop), banner image upload
2. **Account** — organisation name, bio, website, ABN (with verification badge), email (read-only), public profile link
3. **Email & Password** — change password form (current + new + confirm)
4. **Team Members** — member list (name, role, joined date), invite form (email + role dropdown: admin/editor/viewer)
5. **Default Event Settings** — default spots, booth size, fee range, power, water (pre-fill for new events)
6. **Auto-response Template** — textarea for automatic reply to new applications
7. **Notifications** — 5 toggles: New applications, Deadline reminders, Vendor messages, Payment received, Post-event summaries
8. **Display Preferences** — timezone dropdown, 12h/24h time format toggle
9. **Data Export** — Export events CSV button, Export applications CSV button
10. **Account Status** — Pause account toggle (hides from vendor search)
11. **Danger Zone** — Delete account button (opens confirmation modal)

**API endpoints:**
- `PUT /api/organiser/profile` — update profile (name, bio, website)
- `POST /api/profile/avatar` — upload avatar image
- `PUT /api/organiser/settings/banner` — upload banner image
- `PUT /api/organiser/settings/account` — update account settings
- `PUT /api/organiser/settings/notifications` — toggle notification preferences
- `POST /api/organiser/settings/pause` — pause/unpause account
- `PUT /api/organiser/settings/defaults` — save default event settings
- `PUT /api/organiser/settings/timezone` — save timezone
- `PUT /api/organiser/settings/time-format` — save 12h/24h preference
- `PUT /api/organiser/settings/auto-response` — save auto-response template
- `POST /api/verify-abn` — verify ABN against ABR
- `GET /api/organiser/team` — list team members
- `POST /api/organiser/team/invite` — invite team member
- `DELETE /api/organiser/team/{id}` — remove team member
- `GET /api/organiser/export/events` — download events CSV
- `GET /api/organiser/export/applications` — download applications CSV
- `DELETE /api/organiser/account` — permanently delete account

**User interactions:**
- Avatar preview on file select → upload on confirm
- Banner upload with preview
- ABN auto-verification trigger (fires on blur if 11 digits)
- ABN match badge: green (exact match), amber (partial), red (mismatch)
- Save buttons per section (independent saves)
- Notification toggles save on change
- Timezone/time format save on change
- Data export buttons trigger CSV download
- Pause toggle with confirmation
- Delete account opens modal → requires typing "DELETE" to confirm

---

### 7. Application Inbox (panel-inbox)

**HTML:** Lines 1562–1580
**JS:** `loadOrgInbox()` ~4150, `filterInbox()` ~4180, `renderInbox()` ~4200, `approveInboxApp()` ~4250, `declineInboxApp()` ~4270

**Data displayed:**
- Search bar (by vendor name or event name)
- Status filter dropdown: All / Pending / Approved / Rejected
- Application cards: vendor avatar, trading name, cuisine tags, event name, applied date, status badge
- Approve / Decline / Message action buttons per card

**API endpoints:**
- `GET /api/organiser/applications` — all applications across all events
- `PATCH /api/organiser/applications/{id}/status` — approve or decline

**User interactions:**
- Search input filters cards client-side
- Status dropdown filters by application status
- Approve/decline with inline status update
- Message button → opens Messages panel with vendor thread

---

### 8. Calendar (panel-calendar)

**HTML:** Lines 1582–1608
**JS:** `loadOrgCalendar()` ~4300, `orgCalNav()` ~4330, `renderOrgCalendar()` ~4350, `exportICal()` ~4420, `downloadIcsSnapshot()` ~4460

**Data displayed:**
- Month/year header with left/right navigation arrows
- Calendar grid: 7-column (Mon–Sun), event dots colour-coded (live = green, deadline = amber, past = grey)
- Legend: Live events, Application deadlines, Past events
- iCal export button

**API endpoints:**
- `GET /api/organiser/calendar` — events with dates for calendar display
- `POST /api/organiser/calendar-token` — generate subscription token for live calendar feed

**User interactions:**
- Month navigation (previous/next arrows)
- Click on date with events → shows event list for that day
- iCal export → opens subscription modal with:
  - Apple Calendar link (webcal:// protocol)
  - Google Calendar link
  - Copy URL button
  - One-time .ics file download option (`downloadIcsSnapshot`)

---

### 9. Analytics (panel-analytics)

**HTML:** Lines 1611–1707
**JS:** `loadOrgAnalytics()` ~4793, `setOaRange()` ~4500, `oaToggleCal()` ~4530, `oaCalApply()` ~4570, `_anaTab()` ~4600, `_renderRevenue()` ~4620, `_renderApplications()` ~4660, `_renderVendors()` ~4700, `_renderEvents()` ~4740, `_renderReputation()` ~4770, `exportAnalyticsCSV()` ~4870, `_anaFmtMoney()`, `_anaFmtHours()`

**Data displayed:**

**Summary row (6 KPI cards):**
- Revenue (collected), Applications (total), Approval Rate (%), Response Time (hours), Vendors (unique), Rating (avg)

**Tab: Revenue**
- 4 metric cards: Collected, Outstanding, Avg Fee, Collection Rate
- Revenue by event table: Event name, Date, Collected, Outstanding, Invoices
- Revenue forecast table (upcoming events): Event name, Date, Stalls filled, Avg fee, Confirmed, Potential

**Tab: Applications**
- Application funnel: Total → Approved → Rejected → Pending (with percentages)
- Monthly trend (counts by month)
- Application velocity buckets (time-to-decision distribution)
- Avg response time, Avg time to first application

**Tab: Vendors**
- Unique vendors, Repeat vendors, Repeat rate (%)
- Attendance tracking: Showed up, No-shows, Unmarked
- Top vendors table: Vendor name, Suburb, State, Times booked
- Cuisine mix breakdown
- Quality ratings summary

**Tab: Events**
- Event performance table: Event name, Date, Category, Stalls available, Applications, Fill rate, Demand ratio
- Performance by category summary

**Tab: Reputation**
- Rating distribution (5-star histogram)
- Recent reviews list

**Date range controls:**
- Preset buttons: All time, 7d, 30d, 90d, This month
- Custom date range: calendar popup with from/to selection
- Date range passed as `?from=YYYY-MM-DD&to=YYYY-MM-DD` query params

**API endpoints:**
- `GET /api/organiser/analytics` — full analytics payload (revenue, applications, vendors, events_comparison, reputation)
- `GET /api/organiser/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` — date-filtered analytics

**User interactions:**
- Tab switching between Revenue / Applications / Vendors / Events / Reputation
- Date range preset buttons
- Custom date range via calendar popup
- Export CSV button → generates and downloads `pitch-analytics-YYYY-MM-DD.csv` client-side from `window._lastAnalyticsData`
- Export button disabled when no meaningful data exists
- Skeleton loading states for all sections

---

### 10. Vendor Ratings (panel-ratings)

**HTML:** Lines 1709–1719
**JS:** `loadOrgRatings()` ~4967, `loadPendingRatings()` ~5045, `renderPendingRatingsData()` ~5008, `openRateNewModal()` ~5055, `openRateModal()` ~5066, `closeRateModal()` ~5078, `setRateStar()` ~5080, `updateRateStars()` ~5086, `setRebook()` ~5092, `updateRebookBtns()` ~5093, `submitVendorRating()` ~5100

**Data displayed:**
- Info text: "Private ratings — only visible to you"
- Pending ratings section: grouped by event, with vendor names and "Rate" buttons
- Completed ratings list: vendor cards with punctuality score, presentation score, would-rebook flag, private notes, "Edit" button

**API endpoints:**
- `GET /api/organiser/vendor-ratings` — all submitted ratings
- `GET /api/organiser/pending-ratings` — vendors awaiting ratings (post-event)
- `POST /api/organiser/vendor-ratings` — submit or update vendor rating
- `GET /api/organiser/applications` — (used by `openRateNewModal` to find approved vendors)

**User interactions:**
- Click "Rate" on pending vendor → opens Rate Vendor modal
- Click "Edit" on existing rating → opens Rate Vendor modal pre-filled
- Rate Vendor modal: punctuality stars (1–5), presentation stars (1–5), would-rebook toggle (Yes/No), private notes textarea
- Submit saves and refreshes ratings list

**Empty state:** Star icon + "No vendor ratings yet" + explanation text

---

### 11. My Reviews (panel-reviews)

**HTML:** Lines 1721–1736
**JS:** `loadOrgReviews()` ~5115, `flagOrgReview()` ~5159, `_orgStarsHtml()` ~5113

**Data displayed:**
- Rating hero: average score (large number), star visualisation, total review count
- Reviews list: star rating, vendor trading name, event name, date, review body text
- Flag button per review (or "Flagged for review" badge if already flagged)

**API endpoints:**
- `GET /api/organiser/reviews` — reviews received from vendors (with avgRating, totalReviews)
- `POST /api/organiser/reviews/{id}/flag` — flag a review as inappropriate

**User interactions:**
- Flag review → confirmation dialog → marks as flagged (button replaced with badge)
- Rating hero hidden when no reviews exist

**Empty state:** Speech bubble icon + "No reviews yet" + explanation text

---

## 3 Modals

### 1. Rate Vendor Modal

**HTML:** Lines 1741–1783
**JS:** `openRateModal()` ~5066, `closeRateModal()` ~5078, `setRateStar()` ~5080, `setRebook()` ~5092, `submitVendorRating()` ~5100

**Trigger:** "Rate" button in pending ratings section or "Edit" button on existing rating card
**Hidden inputs:** `rate-vendor-id`, `rate-event-id`
**Fields:**
- Subtitle: "Rating: {vendorName}"
- Punctuality: 5-star selector (click to set, `.active` class toggles)
- Presentation: 5-star selector
- Would rebook: Yes / No toggle buttons (green/red highlight)
- Private notes: textarea
- Save / Cancel buttons

**API:** `POST /api/organiser/vendor-ratings` — `{ vendor_user_id, event_id, punctual, presentation, would_rebook, notes }`

---

### 2. Delete Account Modal

**HTML:** Lines 1785–1798
**JS:** `showDeleteOrgModal()` ~4000, `closeDeleteOrgModal()` ~4010, `confirmDeleteOrgAccount()` ~4020

**Trigger:** "Delete account" button in Settings → Danger Zone
**Fields:**
- Warning text explaining permanent deletion
- Text input requiring user to type "DELETE" to confirm
- Cancel / Delete buttons (delete is destructive red)

**API:** `DELETE /api/organiser/account`

---

### 3. Broadcast Message Modal

**HTML:** Lines 1800–1812

**Trigger:** Available from event management context
**Fields:**
- Event selector dropdown (selects which event's vendors to message)
- Message textarea
- "Send to all vendors" button

**API:** `POST /api/messages` — sends to all approved vendors for selected event

---

## Complete API Endpoint Inventory

### Auth & Session
| Method | Endpoint | Purpose |
|--------|----------|---------|
| — | `window.__PITCH_USER__` | Server-injected user object (id, email, role, name) |
| — | `window.__PITCH_PROFILE__` | Server-injected organiser profile |
| — | `window.__PITCH_INIT_DATA__` | Server-injected initial data (events, stats) |
| POST | `/api/logout` | End session |

### Overview
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/overview` | Stat cards, upcoming events, recent applications |
| GET | `/api/organiser/pending-ratings` | Vendors awaiting post-event ratings |

### Events
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/events` | All organiser events |
| POST | `/api/organiser/events` | Create new event |
| PATCH | `/api/organiser/events/{id}` | Update event details |
| PATCH | `/api/organiser/events/{id}/status` | Archive/unarchive event |
| DELETE | `/api/organiser/events/{id}` | Delete event |

### Applications
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/applications` | All applications across all events |
| GET | `/api/organiser/events/{id}/applications` | Applications for specific event |
| PATCH | `/api/organiser/applications/{id}/status` | Approve or decline application |

### Messages
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/messages` | All threads for current user |
| POST | `/api/messages` | Start new thread |
| GET | `/api/messages/{threadKey}` | Messages in specific thread |
| POST | `/api/messages/{threadKey}` | Send message to thread |

### Announcements & Notifications
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/announcements` | Platform announcements |
| POST | `/api/announcements/{id}/dismiss` | Dismiss announcement |
| GET | `/api/notifications` | Notification list |

### Settings — Profile & Account
| Method | Endpoint | Purpose |
|--------|----------|---------|
| PUT | `/api/organiser/profile` | Update profile (name, bio, website) |
| POST | `/api/profile/avatar` | Upload avatar image |
| PUT | `/api/organiser/settings/banner` | Upload banner image |
| PUT | `/api/organiser/settings/account` | Update account settings |
| POST | `/api/verify-abn` | Verify ABN against ABR |

### Settings — Preferences
| Method | Endpoint | Purpose |
|--------|----------|---------|
| PUT | `/api/organiser/settings/notifications` | Toggle notification preferences |
| PUT | `/api/organiser/settings/defaults` | Save default event settings |
| PUT | `/api/organiser/settings/timezone` | Save timezone |
| PUT | `/api/organiser/settings/time-format` | Save 12h/24h format |
| PUT | `/api/organiser/settings/auto-response` | Save auto-response template |
| POST | `/api/organiser/settings/pause` | Pause/unpause account |

### Settings — Team
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/team` | List team members |
| POST | `/api/organiser/team/invite` | Invite team member (email + role) |
| DELETE | `/api/organiser/team/{id}` | Remove team member |

### Settings — Data & Account
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/export/events` | Download events CSV |
| GET | `/api/organiser/export/applications` | Download applications CSV |
| DELETE | `/api/organiser/account` | Permanently delete account |

### Calendar
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/calendar` | Events with dates for calendar display |
| POST | `/api/organiser/calendar-token` | Generate calendar subscription token |

### Analytics
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/analytics` | Full analytics payload |
| GET | `/api/organiser/analytics?from=&to=` | Date-filtered analytics |

### Vendor Ratings
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/vendor-ratings` | All submitted ratings |
| GET | `/api/organiser/pending-ratings` | Vendors awaiting rating |
| POST | `/api/organiser/vendor-ratings` | Submit or update rating |

### Reviews
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organiser/reviews` | Reviews received from vendors |
| POST | `/api/organiser/reviews/{id}/flag` | Flag review as inappropriate |

### Attendance
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/organiser/mark-attendance` | Mark vendor showed/no-show |

### Platform
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/platform-limits` | Max stalls per event, max events per org |

**Total: 40 endpoints** (3 server-injected + 37 API routes)

---

## JS Architecture Notes

### Panel Routing
- `PANEL_TITLES` object maps panel IDs → page titles
- `PANEL_PATHS_ORG` maps panel IDs → URL paths for `history.pushState`
- `showPanel(panelId, pushState)` hides all panels, shows target, updates sidebar active state, pushes URL
- `routeOnLoadOrg()` reads URL path on page load → calls `showPanel()` for deep linking

### Auth Wrapper
- `pitchFetch(url, opts)` — wrapper around `fetch()` that injects `X-Pitch-Auth` header from session
- All API calls use `pitchFetch()` instead of raw `fetch()`

### Server-Side Data Injection
- `window.__PITCH_USER__` — user object (id, email, role, first_name, last_name)
- `window.__PITCH_PROFILE__` — organiser profile (org_name, bio, website, suburb, abn, etc.)
- `window.__PITCH_INIT_DATA__` — pre-loaded data to avoid initial API calls (events, settings, stats)

### Initialisation Flow (`initDashboard()`)
1. Check suspension status → show overlay if suspended
2. Hydrate name + email into sidebar and topbar
3. Render init data (events, settings)
4. Load threads (messages sidebar count)
5. Load notifications
6. Load settings panel data
7. Route to correct panel based on URL
8. Load platform limits

### Platform Limits
- `loadPlatformLimits()` fetches `GET /api/platform-limits`
- Stores `_maxStallsPerEvent` and `_maxEventsPerOrg` globally
- `validateSpotsInput()` enforces spots limit on input change
- `checkSpotsLimit()` blocks event creation if at org event limit

### Message Polling
- `startOrgMsgPoll()` starts `setInterval` at 8-second intervals
- Polls `GET /api/messages/{threadKey}` for active conversation
- `stopOrgMsgPoll()` clears interval when leaving Messages panel
- Announcement threads detected and rendered as system messages

### Calendar System (`neCal`)
- Custom date picker for event date and application deadline inputs
- Two-month popup view with day cells
- Used in Post an Event form (Step 1 for event date, Step 3 for deadline)
- Separate from the Calendar panel's month grid

### Analytics Date Range
- `_oaFrom` / `_oaTo` global state for selected date range
- `setOaRange(preset)` sets range from presets (7d, 30d, 90d, this-month, all)
- `oaToggleCal()` opens/closes custom date range calendar popup
- `oaCalApply()` applies custom range and reloads analytics
- `window._lastAnalyticsData` stores last fetched data for CSV export

### Location Autocomplete
- External script: `/location-autocomplete.js`
- `pitchLocAC(inputId, opts)` initialises autocomplete on suburb/venue inputs
- Applied to new event form inputs statically
- Applied to edit event form inputs dynamically (re-initialised after `openEventMgmt` renders form)

### Utility Functions
- `_orgFmtDate(iso)` — formats ISO date to `en-AU` locale (e.g. "19 Apr 2026")
- `_orgStarsHtml(rating)` — generates filled/empty star HTML for rating display
- `_anaFmtMoney(val)` — formats dollar amounts for analytics
- `_anaFmtHours(val)` — formats hours for response time display

---

## Mobile Navigation

No dedicated mobile bottom tabs in HTML. The sidebar uses responsive CSS:
- Sidebar collapses on mobile (CSS media queries in style block)
- Topbar hamburger icon toggles sidebar visibility
- Panel content fills viewport width on mobile

---

## Subscription Gating

No explicit subscription tier gating visible in the organiser dashboard HTML/JS. Platform limits (`_maxStallsPerEvent`, `_maxEventsPerOrg`) are enforced server-side and fetched via `GET /api/platform-limits`, but there are no client-side plan-tier checks, locked panels, or upgrade prompts like the vendor dashboard has.

---

## Sidebar Navigation Structure

```
Home
  └── Overview

Events
  ├── My Events
  ├── Post an Event
  ├── Applications (Inbox)
  └── Calendar

Insights
  ├── Analytics
  ├── Vendor Ratings
  └── My Reviews

Account
  ├── Messages
  └── Settings
```
