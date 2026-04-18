# Vendor Dashboard Section Map

Reference for the `/vendor-dashboard` migration phase.
Source: `pages/vendor-dashboard.html` (9,645 lines)

---

## File Structure Overview

| Section | Line Range |
|---------|------------|
| CSS (`<style>` block) | 1–1853 |
| Loading/error overlays | 1854–1875 |
| Menu item modal HTML | 1877–1996 |
| Sidebar navigation | 2000–2079 |
| Topbar + notification bell | 2084–2101 |
| All 15 panel containers | 2106–3498 |
| Mobile bottom tabs + more drawer | 3503–3533 |
| Subscription modal | 3535–3574 |
| Delete account modal | 3576–3591 |
| Review organiser modal | 3593–3620 |
| Stripe payment modal | 2818–2833 (inside Payments panel) |
| JavaScript | 3624–9645 |

---

## 15 Panels

### 1. Overview (panel-overview)

**HTML:** Lines 2106–2166
**JS:** `initDashboard()` ~4832, `loadOverviewRating()` ~5096, `loadEvents()` ~5111, `renderEventsMiniList()` ~5120, `loadActivity()` ~5722, `renderActivityData()` ~5729

**Data displayed:**
- 4 stat cards: Active Applications, Approved Events, Average Rating, Profile Views
- Starter plan usage counter (applications this month, x/10)
- Post-event review prompts banner
- Recommended events list (mini cards)
- Recent activity feed (application status changes)

**API endpoints:**
- Auth data injected server-side via `window.__PITCH_USER__` and `window.__PITCH_PROFILE__` (no fetch needed)
- `GET /api/vendor/events` — recommended events
- `GET /api/vendor/applications` — activity feed data
- `GET /api/vendor/reviews` — average rating
- `GET /api/vendor/pli-status` — PLI document status
- `GET /api/vendor/subscription-info` — plan details for usage counter

**User interactions:**
- Click recommended event → opens Browse Events panel with event detail
- Click activity item → navigates to relevant panel
- Click "Browse events" nudge → switches to Browse panel
- Subscription upgrade CTA (Starter users)

**Subscription gating:**
- Usage counter visible only on Starter (hidden for Pro/Growth)
- Profile Views stat card visible only on Pro/Growth

---

### 2. Applications (panel-applications)

**HTML:** Lines 2168–2221
**JS:** `loadApplications()` ~5599, `renderApplicationsData()` ~5607, `withdrawApp()` ~5770, `filterApps()` ~5340

**Data displayed:**
- Acceptance rate bar (Pro/Growth only)
- Status filter buttons: All, Pending, Approved, Rejected, Withdrawn
- Applications table: Event name, Category, Status badge, Applied date, Action (View/Withdraw/Message/Pay)

**API endpoints:**
- `GET /api/vendor/applications` — all vendor applications
- `POST /api/events/{id}/withdraw` — withdraw an application

**User interactions:**
- Filter by status (All/Pending/Approved/Rejected/Withdrawn)
- View event detail (opens event detail panel)
- Withdraw pending application
- Message organiser (opens Messages panel)
- Pay stall fee (opens Stripe payment modal)
- "Browse events" nudge link when few applications

**Subscription gating:**
- Acceptance rate bar: Pro/Growth only

---

### 3. Browse Events (panel-browse)

**HTML:** Lines 2223–2341
**JS:** `loadBrowseEvents()` ~5380, `renderBrowseGrid()` ~5194, `applyBrowseFilters()` ~5340

**Data displayed:**
- Filter bar: text search, category dropdown, status dropdown (not applied/applied/approved)
- Day-of-week picker popup (Mon–Sun toggle buttons)
- Date range inputs with dual-month calendar popup
- Event cards grid with: name, date, suburb, category, stall availability, apply button

**API endpoints:**
- `GET /api/vendor/events` — fetches ALL events, filters client-side

**User interactions:**
- Text search (filters event name/suburb)
- Category filter dropdown
- Status filter (not applied / applied / approved)
- Day-of-week filter (multi-select popup)
- Date range filter (text input or calendar popup)
- Clear filters button
- Click event card → opens Event Detail panel
- Apply button on card → quick apply (with confirmation)

**Subscription gating:**
- None for browsing
- Application count limited to 10/month on Starter

---

### 4. Event Detail (panel-event-detail)

**HTML:** Lines 2343–2351
**JS:** `openEventDetail()` ~5392, `renderEventDetail()` ~5407, `applyFromDetail()` ~5511

**Data displayed:**
- Back button to Browse
- Event name, date(s), location/suburb
- Category, description
- Stall availability (filled/total with progress bar)
- Stall fee range
- Organiser name + profile link
- Application message textarea
- Apply button

**API endpoints:**
- `GET /api/vendor/events` — uses cached data from browse
- `POST /api/events/{id}/apply` — submit application with optional message

**User interactions:**
- Back to browse events
- Write application message
- Apply to event
- View organiser profile

---

### 5. Profile (panel-profile)

**HTML:** Lines 2353–2557
**JS:** `saveProfile()` ~4473, `updatePreview()` ~4316, `toggleTag()` ~4289, `previewAndUploadAvatar()` ~6126

**Data displayed:**
- **Identity section:** Business name, Bio (250 char max with counter), Cuisine tags (multi-select: BBQ, Mexican, Asian Fusion, Italian, Desserts, Coffee & Drinks, Vegan, Burgers, Seafood, Other), Setup type (Food Truck / Pop-up Stall / Cart)
- **Operations section:** Stall dimensions (W x D metres), Power/Water toggles, Price range ($/$$/$$)
- **Verification section:** Instagram handle, ABN with auto-verify
- **Photos section:** Gallery upload (drag-drop, up to 4 photos on Starter, 8 on Pro, 12 on Growth)
- **Sidebar:** Live preview card, Profile picture upload

**API endpoints:**
- `POST /api/vendor/profile` — save all profile fields
- `POST /api/verify-abn` — ABN verification (calls ABR API)
- `POST /api/vendor/photos` — upload gallery photos
- `POST /api/profile/avatar` — upload profile picture

**User interactions:**
- Edit all profile fields with live preview
- Toggle cuisine tags
- Select setup type radio
- Toggle power/water requirements
- Select price range
- Upload/reorder/delete gallery photos (drag-drop)
- Upload profile picture
- Verify ABN (auto-verifies on input)
- Save changes button

**Subscription gating:**
- Gallery limit: 4 (Starter), 8 (Pro), 12 (Growth)
- Vanity URL field: Growth only
- Gallery naming: Growth only

---

### 6. Documents (panel-documents)

**HTML:** Lines 2559–2570
**JS:** `renderDocuments()` ~5848

**Data displayed:**
- Document progress bar (x/y verified)
- Document grid cards: Food Safety Certificate, Public Liability Insurance (PLI), Council Registration, Liquor Licence (optional)
- Each card shows: status (verified/pending/expired/missing), expiry date, upload button

**API endpoints:**
- `POST /api/vendor/documents` — upload document file
- `GET /api/vendor/pli-status` — PLI verification status

**User interactions:**
- Upload document file for each type
- View document status and expiry
- Re-upload expired documents

**Subscription gating:**
- None

---

### 7. Earnings (panel-earnings)

**HTML:** Lines 2572–2656
**JS:** `loadEarnings()` ~6915, `downloadEarningsPDF()` ~7021, `downloadEarningsCSV()` ~7111

**Data displayed:**
- 4 summary stats: All-time earned, This month, Last month, Pending payout
- Earnings history table: Event, Date, Organiser, Stall fee, Platform fee, Net, Status
- Payout settings (bank account — "Coming soon", disabled)
- Tax summary: FY total, Download PDF button, Export CSV button

**API endpoints:**
- `GET /api/vendor/earnings` — earnings data

**User interactions:**
- View earnings history table
- Download earnings PDF (jsPDF client-side generation)
- Export earnings CSV
- View tax summary for financial year

**Subscription gating:**
- None (data available to all tiers)

---

### 8. Messages (panel-messages)

**HTML:** Lines 2658–2718
**JS:** `loadAllThreads()` ~4181, `sendMessage()` ~4158, `openThread()` ~3994, `closeConvo()` ~3970, `handleMsgKey()` ~4176, polling at 5-second interval ~4246

**Data displayed:**
- Inbox panel: search, thread list with organiser name, last message preview, timestamp, unread dot
- Conversation panel: message bubbles (sent/received), typing indicator, organiser avatar + name, event context line
- Cold contact gate banner (Growth feature)

**API endpoints:**
- `GET /api/messages` — all threads
- `GET /api/messages/{threadKey}` — single conversation messages
- `POST /api/messages/{threadKey}` — send message (or create new thread)
- `GET /api/announcements` — platform announcements
- Real-time polling: re-fetches active thread every 5 seconds

**User interactions:**
- Search conversations
- Select thread from inbox
- Read message history
- Send message (Enter to send, Shift+Enter for new line)
- Back to inbox button (mobile)
- View organiser profile link

**Subscription gating:**
- Starter: locked behind "get approved first" gate — can only message after being approved for an event
- Pro: can message any organiser they've applied to
- Growth: cold contact — can message any organiser on the platform

---

### 9. Menu (panel-menu)

**HTML:** Lines 2722–2753
**Menu item modal HTML:** Lines 1877–1996
**JS:** `loadMenu()` ~7692, `renderMenuGrid()` ~7700, `openMenuModal()` ~7777, `closeMenuModal()` ~7802, `deleteMenuItem()` ~7808, `saveMenuItem()` ~7870, `saveMenuOrder()` ~7986

**Data displayed:**
- Item count header
- Menu cards grid: photo, name, description, price, dietary tags, signature badge
- Drag-reorder bar with "Save order" button
- Completeness prompt (shown when < 3 items with photos)
- Empty state with "Add your first item" CTA

**API endpoints:**
- `GET /api/vendor/menu` — all menu items
- `POST /api/vendor/menu` — create new item
- `PUT /api/vendor/menu/{id}` — update item
- `DELETE /api/vendor/menu/{id}` — delete item
- `POST /api/vendor/menu/reorder` — save drag-reorder positions

**User interactions:**
- Add menu item (opens modal)
- Edit menu item (opens modal pre-filled)
- Delete menu item (confirmation dialog)
- Mark item as signature
- Toggle dietary tags (GF, V, VG, DF, NF, Halal, Kosher)
- Upload item photo
- Set item price (fixed or range)
- Drag-and-drop reorder cards
- Save order

**Subscription gating:**
- Starter: limited menu items
- Pro/Growth: unlimited items

---

### 10. Reviews (panel-reviews)

**HTML:** Lines 2755–2770
**JS:** `loadReviews()` ~6599

**Data displayed:**
- Rating hero: large average score, star rating, review count
- Review list: reviewer name, date, star rating, review text, flag button

**API endpoints:**
- `GET /api/vendor/reviews` — all reviews
- `POST /api/vendor/reviews/{id}/flag` — flag inappropriate review

**User interactions:**
- View all reviews
- Flag inappropriate review

**Subscription gating:**
- None

---

### 11. Payments (panel-payments)

**HTML:** Lines 2772–2868
**Stripe modal HTML:** Lines 2818–2833
**JS:** `loadStallFees()` ~6672, `openStripePayModal()` ~6809, `closeStripePayModal()` ~6862, `submitStripePayment()` ~6870, `downloadPaymentPDF()` ~9295, `downloadBookkeeping()` ~9408

**Data displayed:**
- 4 summary stats: Total paid, Outstanding amount, Next due date, Events with fees
- Payment method info (Stripe secured)
- Outstanding stall fees list with "Pay now" buttons
- Payment history table: Event, Amount, Date, Status, Receipt
- How payments work info card

**API endpoints:**
- `GET /api/vendor/stall-fees` — all stall fees (paid + outstanding)
- `POST /api/vendor/stall-fees/{id}/pay` — initiate Stripe payment (returns client secret)
- `POST /api/vendor/stall-fees/{id}/confirm` — confirm Stripe payment after 3D Secure
- Stripe.js Payment Element for card input

**User interactions:**
- View outstanding fees
- Pay stall fee (opens Stripe Payment Element modal)
- Complete 3D Secure authentication if required
- View payment history
- Download payment PDF (jsPDF, Pro+)
- Download bookkeeping summary (Growth)

**Subscription gating:**
- Payment PDF export: Pro/Growth
- Bookkeeping summary export: Growth only

---

### 12. Calendar (panel-calendar)

**HTML:** Lines 2871–2907
**JS:** `loadCalendar()` ~7139, `renderCalendar()` ~7163, `exportICal()` ~9188

**Data displayed:**
- Month navigation (prev/next arrows, month label)
- Calendar grid (Mon–Sun) with event dots colour-coded: green (approved), gold (pending), terracotta (declined)
- Event tooltip on hover
- Empty state with "Browse Events" CTA
- Legend bar
- Export to calendar button

**API endpoints:**
- `GET /api/vendor/calendar` — events with dates and statuses
- `POST /api/vendor/calendar-token` — generate iCal token for export

**User interactions:**
- Navigate months (prev/next)
- Click event dot → view event detail
- Export to calendar (generates .ics file download)

**Subscription gating:**
- iCal export: Pro/Growth

---

### 13. Analytics (panel-analytics)

**HTML:** Lines 2909–3106
**JS:** `loadAnalyticsData()` ~8675, `_applyAnalyticsData()` ~8698, `setVanRange()` ~8387, date range calendar ~8387–8658, chart rendering ~8030–8386

**Data displayed:**
- Date range filter bar (All time, 7d, 30d, 90d, This month, custom range with calendar)
- **Profile views:** Total + unique count, daily views line chart (canvas), traffic source breakdown (Growth), viewer type breakdown (Growth)
- **Application analytics:** Acceptance rate, total submitted, status breakdown, 6-month trend sparkline
- **Revenue summary:** Total earned, Outstanding, Events count, 6-month revenue bar chart
- **Reviews & ratings:** Average score, review count, 6-month rating trend
- **Search & discovery (Growth):** Search appearances, view conversion rate, discovery funnel, daily appearances chart
- **Peak viewing hours (Growth):** Hourly heatmap, peak time insight text
- **Competition insights (Growth):** Competitor comparison data

**API endpoints:**
- `GET /api/vendor/analytics` — all analytics data (optionally with `?from=&to=` date range)

**User interactions:**
- Switch date range presets
- Custom date range via text input or calendar popup
- View charts and metrics
- Scroll between analytics sections

**Subscription gating:**
- Entire panel locked on Starter (shows blur overlay with upgrade CTA)
- Profile views, Application analytics: Pro/Growth
- Revenue summary, Reviews & ratings: Pro/Growth (only if data exists)
- Search & discovery, Peak hours, Competition insights: Growth only

---

### 14. Event History (panel-history)

**HTML:** Lines 3108–3131
**JS:** `loadMarketHistory()` ~7351, `renderHistoryPanel()` ~7253, `renderHistoryList()` ~7378

**Data displayed:**
- Stats summary: Events attended, Unique organisers, Avg rating received, Best market highlight
- Filter buttons: All, Attended, Upcoming (+ dynamic category pills)
- History list cards: Event name, date, organiser, category, status badge, rating given/received

**API endpoints:**
- `GET /api/vendor/history` — all past and upcoming approved events

**User interactions:**
- Filter by status (All/Attended/Upcoming)
- Filter by category
- View event details
- Review organiser (opens Review Organiser modal)

**Subscription gating:**
- None

---

### 15. Settings (panel-settings)

**HTML:** Lines 3133–3498
**JS:** `saveAccountSettings()` ~7512, `savePassword()` ~7532, `saveNotifSettings()` ~7575, `savePhone()` ~7589, `save2FA()` ~7601, `saveVisibility()` ~7613, `saveExtSettings()` ~7617, `togglePause()` ~7999

**Sub-sections (anchor tabs):** Account, Profile, Billing, Preferences, Connections

**Data displayed:**
- **Account:** Email address (current + change), Password change, Phone number, 2FA toggle
- **Profile:** Visibility toggles (hide phone, ABN, reviews), Pause profile, Default application message
- **Billing:** Current plan card with upgrade buttons, Invoice details (business name, address), Exports (Growth), Team member invite (Growth)
- **Preferences:** Notification toggles (app status, new events, cert expiry, reviews, payments), Display prefs (12h/24h time), Timezone selector
- **Connections:** Google account link status, Email/password login status
- **Danger zone:** Delete account button

**API endpoints:**
- `PUT /api/vendor/settings/account` — update email
- `PUT /api/vendor/settings/account` — change password (same endpoint, different body)
- `PUT /api/vendor/settings/phone` — update phone
- `PUT /api/vendor/settings/2fa` — toggle 2FA
- `PUT /api/vendor/settings/notifications` — notification preferences
- `PUT /api/vendor/settings/extended` — default message, invoice details, timezone, visibility
- `PUT /api/vendor/settings/pause` — toggle profile pause
- `GET /api/vendor/settings/connected` — connected accounts status
- `POST /api/profile/plan` — change subscription plan
- `POST /api/stripe/portal` — open Stripe billing portal
- `DELETE /api/vendor/account` — delete account

**User interactions:**
- Change email, password, phone
- Toggle 2FA
- Toggle profile visibility options
- Pause/unpause profile
- Set default application message
- Manage subscription (upgrade/downgrade via modal)
- Set invoice details
- Toggle notification preferences
- Switch time format (12h/24h)
- Change timezone
- Link/unlink Google account
- Send team member invite (Growth)
- Download application CSV (Growth)
- Download bookkeeping summary (Growth)
- Delete account (confirmation modal with "DELETE" text input)

**Subscription gating:**
- New event alerts timing: Starter (standard), Pro (early), Growth (24h early access)
- Certificate expiry reminders: Pro/Growth
- Exports section: Growth only
- Team invite: Growth only

---

## 5 Modals

### Menu Item Modal (lines 1877–1996)
- Add/edit menu item form: name, description, price (fixed/range), dietary tags, photo upload, signature toggle
- JS: `openMenuModal()`, `saveMenuItem()`, `closeMenuModal()`

### Subscription Modal (lines 3535–3574)
- Plan selection radio: Starter (free), Pro ($29/mo), Growth ($79/mo)
- Confirm change button
- JS: `openSubModal()`, `closeSubModal()`, `confirmSubChange()`

### Delete Account Modal (lines 3576–3591)
- Confirmation with "DELETE" text input
- JS: `openDeleteModal()`, `closeDeleteModal()`, `handleModalClick()`

### Review Organiser Modal (lines 3593–3620)
- Star rating (1–5), review text, submit
- JS: `openReviewOrgModal()`, `submitOrgReview()`, `closeReviewOrgModal()`

### Stripe Payment Modal (lines 2818–2833, inside Payments panel)
- Stripe Payment Element for card input
- Pay summary, error display, submit/cancel
- JS: `openStripePayModal()`, `submitStripePayment()`, `closeStripePayModal()`

---

## Full API Endpoint Inventory

### Profile & Identity
| Method | Endpoint | Used by |
|--------|----------|---------|
| POST | `/api/vendor/profile` | Save profile |
| POST | `/api/verify-abn` | ABN verification |
| POST | `/api/vendor/photos` | Upload gallery photos |
| POST | `/api/profile/avatar` | Upload profile picture |
| POST | `/api/vendor/documents` | Upload documents |
| GET | `/api/vendor/pli-status` | PLI status check |

### Events & Applications
| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/api/vendor/events` | Browse events, overview, event detail |
| POST | `/api/events/{id}/apply` | Apply to event |
| POST | `/api/events/{id}/withdraw` | Withdraw application |
| GET | `/api/vendor/applications` | Applications list, activity feed |
| GET | `/api/vendor/calendar` | Calendar view |
| POST | `/api/vendor/calendar-token` | iCal export |
| GET | `/api/vendor/history` | Event history |

### Messages
| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/api/messages` | All threads |
| GET | `/api/messages/{threadKey}` | Single thread messages |
| POST | `/api/messages/{threadKey}` | Send message / create thread |
| GET | `/api/announcements` | Platform announcements |
| POST | `/api/announcements/{id}/dismiss` | Dismiss announcement |

### Financial
| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/api/vendor/stall-fees` | Stall fees list |
| POST | `/api/vendor/stall-fees/{id}/pay` | Initiate payment |
| POST | `/api/vendor/stall-fees/{id}/confirm` | Confirm payment |
| GET | `/api/vendor/earnings` | Earnings data |
| POST | `/api/stripe/portal` | Stripe billing portal |

### Menu
| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/api/vendor/menu` | Menu items list |
| POST | `/api/vendor/menu` | Create menu item |
| PUT | `/api/vendor/menu/{id}` | Update menu item |
| DELETE | `/api/vendor/menu/{id}` | Delete menu item |
| POST | `/api/vendor/menu/reorder` | Save drag-drop order |

### Analytics & Reviews
| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/api/vendor/analytics` | Analytics panel |
| GET | `/api/vendor/reviews` | Reviews list |
| POST | `/api/vendor/reviews/{id}/flag` | Flag review |
| POST | `/api/vendor/organiser-review` | Submit organiser review |
| GET | `/api/vendor/pending-reviews` | Pending review prompts |

### Settings & Account
| Method | Endpoint | Used by |
|--------|----------|---------|
| PUT | `/api/vendor/settings/account` | Email/password change |
| PUT | `/api/vendor/settings/phone` | Phone update |
| PUT | `/api/vendor/settings/2fa` | Toggle 2FA |
| PUT | `/api/vendor/settings/notifications` | Notification prefs |
| PUT | `/api/vendor/settings/extended` | Default msg, invoice, timezone, visibility |
| PUT | `/api/vendor/settings/pause` | Pause/unpause profile |
| GET | `/api/vendor/settings/connected` | Connected accounts |
| POST | `/api/profile/plan` | Change subscription |
| GET | `/api/vendor/subscription-info` | Plan details |
| DELETE | `/api/vendor/account` | Delete account |

### System
| Method | Endpoint | Used by |
|--------|----------|---------|
| POST | `/api/logout` | Logout |
| GET | `/api/notifications` | Notification bell |

---

## Subscription Gating Matrix

| Feature | Starter (Free) | Pro ($29/mo) | Growth ($79/mo) |
|---------|:-:|:-:|:-:|
| Browse & apply to events | 10/month limit | Unlimited | Unlimited |
| Profile views stat | - | Yes | Yes |
| Acceptance rate bar | - | Yes | Yes |
| Analytics panel | Locked | Full | Full + extras |
| Profile view charts | - | Yes | Yes |
| Search & discovery analytics | - | - | Yes |
| Peak viewing hours | - | - | Yes |
| Competition insights | - | - | Yes |
| Messages | After approval only | Any applied organiser | Any organiser (cold contact) |
| Gallery photo limit | 4 | 8 | 12 |
| Vanity profile URL | - | - | Yes |
| Gallery naming | - | - | Yes |
| iCal export | - | Yes | Yes |
| Payment PDF export | - | Yes | Yes |
| Bookkeeping summary | - | - | Yes |
| Application CSV export | - | - | Yes |
| New event alert timing | Standard | Early | 24h early access |
| Certificate expiry reminders | - | Yes | Yes |
| Team member invite | - | - | Yes |

---

## Mobile Navigation

- **Bottom tabs (always visible):** Overview, Apply (Applications), Profile, Messages, More
- **More drawer (slide-up):** Browse Events, Calendar, Documents, Menu, Market History, Reviews, Payments, Earnings, Settings, Log out

---

## JavaScript Architecture

- Auth: `window.__PITCH_USER__`, `window.__PITCH_PROFILE__`, `window.__PITCH_TOKEN__` injected server-side
- All API calls go through `pitchFetch()` wrapper (adds `X-Pitch-Auth` header)
- Panel switching: `showPanel(name, btn)` hides all panels, shows target, updates topbar title
- Subscription gating: `applySubscriptionGating(plan)` ~8920 runs on load, shows/hides/locks features
- Chart rendering: raw Canvas 2D API (no chart library) ~8030–8386
- PDF generation: jsPDF + jspdf-autotable (loaded via CDN)
- Message polling: `setInterval` at 5000ms for active conversation
- Init data: `window.__PITCH_INIT_DATA__` server-side injection for stall fees, applications (avoids extra fetches)
