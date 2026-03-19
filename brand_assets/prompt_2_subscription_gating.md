# PROMPT 2 — Subscription-Aware Feature Gating Across the Entire Platform

## What you are implementing

Every feature on the Pitch platform must behave differently depending on the vendor's current subscription tier. This prompt defines exactly what each subscription tier can see, access, and interact with across every page and section of the platform. Nothing should be hardcoded to show the same experience to every vendor. The platform must read the logged-in vendor's subscription tier from their account and render every relevant UI element accordingly.

The three vendor tiers are: Starter (free), Pro ($29/month), Growth ($79/month).

Organisers have no subscription tiers and are not affected by any of this. This entire prompt applies to vendor accounts only.

There are three patterns for how gated features should be handled:

**Pattern A — Hard lock:** The feature is completely hidden. The vendor has no way to access it or see it exists.

**Pattern B — Soft lock:** The feature is visible but disabled. The vendor can see it, understand what it does, but cannot use it. A tooltip or inline message explains which plan unlocks it and links to the pricing page. This is preferred over hard locking for most features because it drives upgrade motivation.

**Pattern C — Upgrade prompt:** The vendor clicks or interacts with the feature and instead of the feature itself they see a clean upgrade prompt — a short explanation of what the feature does, which plan it is on, the monthly price, and a single CTA button "Upgrade to [plan name]" that goes directly to the billing page with the correct plan pre-selected.

Use Pattern B or C for almost everything. Only use Pattern A for things that are genuinely irrelevant to show — for example, do not show the "Second account user" setting to a Starter vendor because there is nothing useful to show them. But do show them the analytics section with locked states because they will want to know it exists.

---

## Dashboard — Overview tab

### Stats cards at the top of the overview

All four stats cards — Active Applications, Approved Events, Average Rating, Profile Views — must render for all tiers. However Profile Views has a locked state for Starter.

**Active Applications** — show for all tiers, no gating.
**Approved Events** — show for all tiers, no gating.
**Average Rating** — show for all tiers, no gating.
**Profile Views** — this stat is gated:
- Starter: The card renders but shows a lock icon instead of a number. Tooltip on hover: "Profile view tracking is available on Pro and Growth plans. Upgrade to see how many organisers have viewed your profile." Links to pricing page.
- Pro: Shows 30-day total count as a number.
- Growth: Shows 30-day total count plus a small sparkline trend indicator next to the number — a tiny upward or downward arrow with the week-on-week percentage change.

### Recommended events section

This section appears on all tiers but the content differs.
- Starter: Shows a generic list of upcoming events sorted by nearest date. No personalisation. A small label above the list reads "Upgrade to Pro for personalised recommendations based on your cuisine and history."
- Pro: Shows a personalised list based on cuisine type, location, and past application history. Label reads "Recommended for you."
- Growth: Shows personalised list plus any unmet demand matches highlighted with a special badge — a small green badge reading "High match — organiser is actively seeking your cuisine." These appear at the top of the recommendations list.

### Recent activity / application status table

Show for all tiers with no gating. All vendors need to see their application history regardless of plan.

---

## Dashboard — Browse Events tab

### Event cards in the browse grid

All tiers see the same event cards. No gating on browsing.

### Application count indicator on event cards

Each event card shows how many spots remain. The application count feature — showing how many total applications an event has received — is gated:
- Starter: Event card shows spots remaining only. No application count shown.
- Pro: Event card shows spots remaining plus total application count — for example "14 of 20 spots filled — 67 applications received."
- Growth: Event card shows spots remaining, total application count, plus cuisine category breakdown button — a small "see breakdown" link that opens a tooltip showing how many vendors in each cuisine category have applied.

### Filter and search

All tiers get full access to all filters — category, date, location, stall fee range. No gating on filters.

### New event notification badge

When a new event is posted that matches the vendor's cuisine and location, a "New" badge appears on the event card.
- Starter: No badge — they find new events by browsing
- Pro: "New" badge appears on event cards for events posted in the last 2 hours matching their profile
- Growth: "New" badge appears on event cards for events posted in the last 72 hours matching their profile, with an additional "Early access" badge on events that Pro vendors cannot yet see (events in the 24-hour Growth-exclusive window)

---

## Dashboard — Apply flow (application modal)

### Application note field

All tiers see the note field. Gating is on the template feature only.
- Starter: Plain text area. Label: "Note to organiser (optional)." No template functionality.
- Pro: Text area with a "Use template" button above it. Clicking loads their saved template into the field. A "Manage templates" link below the field opens their saved templates in a side panel.
- Growth: Same as Pro.

### Apply button behaviour when deadline has passed

The apply button state changes based on tier when an event's application deadline has passed.
- Starter: Button is disabled and reads "Applications closed." A small tooltip explains "The deadline for this event has passed."
- Pro: If within 12 hours after deadline, button reads "Apply — late application (closes in Xhr Ym)." A small amber badge on the event card reads "Late applications accepted." After 12 hours the button disables for Pro vendors too.
- Growth: If within 48 hours after deadline, button reads "Apply — late application (closes in Xhr Ym)." A small amber badge reads "Late applications accepted." After 48 hours the button disables.

### Withdraw and reapply button

On a pending application detail page, a "Withdraw application" button appears for all tiers. The reapply behaviour is gated.
- Starter: After withdrawing, the vendor sees a message: "You have withdrawn your application. You cannot reapply to this event on your current plan. Upgrade to Pro to reapply." The apply button for that event is disabled.
- Pro: After withdrawing, can reapply up to 2 times. The apply button is active. After 2 withdrawals for the same event, the button disables with the message "You have reached the reapplication limit for this event on the Pro plan."
- Growth: After withdrawing, can reapply unlimited times before the deadline. The apply button is always active until the deadline (including the 48-hour grace window).

---

## Dashboard — Applications tab

### Application list

All tiers see their full application list with status tabs — All, Pending, Approved, Declined, Withdrawn. No gating on the list itself.

### Shortlist status indicator

Within each pending application row:
- Starter: No shortlist indicator. Pending applications show "Pending" only.
- Pro: No shortlist indicator. Pending applications show "Pending" only.
- Growth: If an organiser has shortlisted this application, the status shows "Shortlisted" with a distinct badge — for example a yellow star badge reading "Shortlisted." If not yet shortlisted but still pending, shows "Pending." Growth vendors also received a push/email notification when they were shortlisted, so this status confirms what they were already notified about.

### Application acceptance rate

At the top of the Applications tab, a summary stat shows the vendor's acceptance rate.
- Starter: This stat is hidden entirely (Pattern A). There is no mention of it. Starter vendors do not have enough application volume for it to be meaningful.
- Pro: Shows overall acceptance rate as a single percentage — for example "Acceptance rate: 68%."
- Growth: Shows overall acceptance rate plus a "See breakdown" link that opens a panel showing acceptance rate broken down by event type (Night Market, Festival, Farmers Market, etc.), by organiser, and by month in the last 12 months.

---

## Dashboard — Analytics tab

### Whether the tab appears

All tiers see the Analytics tab in the sidebar. It is never hidden. Starter and Pro vendors are shown the tab because they need to know analytics exists and understand what they are missing.

### Profile views section

- Starter: Section renders with a lock overlay. Shows a blurred placeholder graph with a lock icon and the message "Unlock profile view analytics on the Pro plan. See how many organisers and consumers have viewed your profile in the last 30 days." CTA: "Upgrade to Pro — $29/month."
- Pro: Shows a line graph of daily profile views over the last 30 days. Total view count displayed prominently.
- Growth: Shows the same graph broken down by source in a stacked view — views from event pages, from vendor search, from homepage featuring — with a week-on-week percentage change indicator.

### Application analytics section

- Starter: Section renders with a lock overlay showing a blurred placeholder. Message: "Track your acceptance rate and identify where you win most often. Available on Pro and Growth plans." CTA: "Upgrade to Pro."
- Pro: Shows overall acceptance rate as a percentage and a simple bar chart of applications submitted per month for the last 6 months.
- Growth: Shows overall acceptance rate plus a breakdown table — acceptance rate by event type, by organiser (top 5 organisers by application volume), and a month-by-month trend for the last 12 months.

### Competitor count section (Growth only)

- Starter: This section does not appear at all (Pattern A). It would be meaningless to show a locked competitor count to a Starter vendor.
- Pro: This section does not appear.
- Growth: A section appears titled "Competition insights." For each event the Growth vendor has applied to in the last 30 days, it shows how many other vendors in their cuisine category also applied to that same event. Presented as a simple table — event name, their category, competitor count, their outcome (approved / pending / declined).

### Shortlist tracking section (Growth only)

- Starter: Does not appear (Pattern A).
- Pro: Does not appear.
- Growth: A section appears titled "Close calls." Shows a list of events where the vendor was shortlisted by the organiser but ultimately not approved. Columns: event name, date, organiser, shortlisted date, final decision date. A small note below: "These are events where you were in serious consideration. Use this to identify which organisers to target and which application angles to improve."

---

## Dashboard — Messages tab

### Message thread list

- Starter: Shows all message threads with organisers from events the vendor has applied to. Cannot start a new message to an organiser they have not applied to. The "New message" button is visible but disabled with a tooltip: "You can message organisers once you have applied to their event. Upgrade to Growth to message any organiser on the platform."
- Pro: Shows all message threads from current and past applications. The "New message" button allows composing a new thread with any organiser from any current or previous application. Cannot message organisers they have never applied to.
- Growth: Shows all message threads. The "New message" button allows searching for any organiser on the entire platform, whether or not they have ever applied to their events. Full cold-contact capability.

---

## Dashboard — Profile tab

### Photos upload

- Starter: Upload widget accepts photos up to a maximum of 4. Once 4 are uploaded, the upload zone shows "Photo limit reached (4/4). Upgrade to Pro to upload up to 10 photos."
- Pro: Upload widget accepts up to 10 photos. Once 10 are uploaded, shows "Photo limit reached (10/10). Upgrade to Growth to upload up to 20 photos in named galleries."
- Growth: Upload widget accepts up to 20 photos. Photos can be organised into named galleries the vendor creates. A "New gallery" button lets them name a collection and drag photos into it.

### Menu section

All tiers get full menu access. No gating. Every vendor can add unlimited menu items with photos, descriptions, prices, seasonal flags, and availability toggles.

### Signature showcase card (Growth only)

In the menu section of the profile editor:
- Starter: The signature showcase toggle on each menu item renders but is locked. Tooltip: "Pin a signature item to the top of your profile and event page previews. Available on the Growth plan."
- Pro: Same — locked toggle with upgrade prompt.
- Growth: Each menu item has an active "Make signature item" toggle. Only one item can be signature at a time. Enabling it on one item automatically disables it on any previous signature item. The signature item appears at the top of the profile editor with a "Signature item" label.

### Custom vanity URL (Growth only)

In profile settings, a "Profile URL" field:
- Starter: The field shows their current system URL (e.g., pitch.com.au/vendors/smoky-joes-bbq) as read-only text with a lock icon. Below it: "Custom URLs are available on the Growth plan. Upgrade to set a short, memorable link for your profile."
- Pro: Same as Starter — system URL shown as read-only with lock and upgrade prompt.
- Growth: The field is editable. The vendor types their desired handle (e.g., smokybbq). As they type, the system checks availability in real time and shows either a green tick ("Available") or a red indicator ("Already taken"). Saving updates the URL instantly. A note below the field: "Your custom URL is live immediately. Your previous system URL still works and redirects to your new URL."

---

## Dashboard — Calendar tab

### Calendar display

All tiers see the calendar with their confirmed and pending events plotted. No gating on the calendar view itself.

### iCal export button

- Starter: Export button is visible but disabled. Tooltip: "Export your calendar to Google Calendar or Apple Calendar. Available on Pro and Growth plans."
- Pro: Export button is active. Clicking generates an iCal file that the vendor downloads or opens directly in their calendar app.
- Growth: Same as Pro.

---

## Dashboard — Payments tab

### Payment history table

All tiers see the payment history table. No gating on viewing payment records.

### Download PDF button

- Starter: Download button visible but disabled. Tooltip: "Download a formatted payment history PDF. Available on Pro and Growth plans."
- Pro: Button active. Downloads a formatted PDF of all payment records.
- Growth: Same PDF download available. Additionally, a second button appears: "Download bookkeeping summary." This generates a separate summary document showing total booth fees paid per financial year, GST component, and platform fees deducted, formatted for sharing with an accountant or bookkeeper.

---

## Dashboard — Settings tab

### Email, password, notifications

All tiers have full access to email, password, and notification preference settings. No gating.

### Document expiry reminders (under notification preferences)

- Starter: The "Document expiry reminder" toggle is visible but locked. Tooltip: "Automated reminders 60 days before your documents expire. Available on Pro and Growth plans. Your documents will not auto-remind on your current plan — set a manual reminder."
- Pro: Toggle is active. When enabled, the system sends an email 60 days before each uploaded document's expiry date.
- Growth: Same as Pro.

### Second account user (under account settings)

- Starter: This setting does not appear (Pattern A). There is nothing to show.
- Pro: This setting does not appear (Pattern A).
- Growth: A section appears titled "Team access." Shows the account owner and a slot for a second user. The vendor enters an email address and that person receives an invitation to create a login linked to this vendor account. The second user has full dashboard access except they cannot change billing, delete the account, or change the vanity URL. Those actions are reserved for the account owner.

### Subscription and billing section

All tiers see their current plan displayed. The section shows:
- Current plan name and price
- Next billing date (for paid tiers) or "Free forever" (for Starter)
- A link to update payment method (paid tiers only)
- An upgrade CTA for Starter and Pro vendors
  - Starter sees: "You are on Starter. Upgrade to Pro for $29/month or Growth for $79/month." With two upgrade buttons.
  - Pro sees: "You are on Pro. Upgrade to Growth for $79/month to unlock top search placement, 24-hour early event access, and competitor insights." With one upgrade button.
  - Growth sees: "You are on the Growth plan." No upgrade prompt. A "Manage subscription" link to cancel or downgrade.

### Profile pause toggle

All tiers have access to the profile pause toggle. No gating.

### Danger zone (account deletion)

All tiers have access to delete their account. No gating.

---

## Public-facing vendor profile page

### What changes based on tier on the public profile

The public profile is what organisers and consumers see when they visit a vendor's profile URL. The vendor's tier affects what appears on this page.

**Profile badge**
- Starter: No badge shown
- Pro: "Pro" badge displayed next to vendor name
- Growth: "Growth" badge displayed next to vendor name — distinct visual style from Pro badge

**Photos gallery**
- Starter: Shows up to 4 photos in a grid
- Pro: Shows up to 10 photos in a grid
- Growth: Shows up to 20 photos organised into named gallery tabs — the visitor can switch between gallery tabs to browse different collections

**Signature showcase card**
- Starter: Menu items displayed as a standard grid. No featured item.
- Pro: Menu items displayed as a standard grid. No featured item.
- Growth: If the vendor has set a signature item, it appears at the top of the profile in a full-width showcase card with larger photo and full description, before the rest of the menu grid. A subtle label reads "Signature item."

**Vanity URL**
- Starter: Profile accessible at system URL only — pitch.com.au/vendors/their-slug
- Pro: Profile accessible at system URL only
- Growth: Profile accessible at both system URL and their chosen vanity URL — both work and point to the same page

---

## Event detail page — vendor-facing elements

### Apply button states

The apply button on an event detail page must reflect the vendor's subscription tier and the event's deadline status.

**Event open (before deadline)**
All tiers: Button active, reads "Apply for a pitch."

**Event at category capacity (waitlist)**
- Starter: Button reads "Join waitlist" — vendor is placed at the bottom of the waitlist.
- Pro: Button reads "Join waitlist" — vendor is placed above Starter vendors.
- Growth: Button reads "Join waitlist" — vendor is placed at the top of the waitlist automatically.

**Event deadline just passed (within grace window)**
- Starter: Button disabled. Reads "Applications closed."
- Pro: If within 12 hours of deadline closing, button reads "Apply — late application" with a countdown timer showing how long remains in the grace window.
- Growth: If within 48 hours of deadline closing, same treatment with 48-hour countdown.

**Event deadline fully passed (outside all grace windows)**
All tiers: Button disabled. Reads "Applications closed."

### Application count display on event page

The event detail page shows spots remaining. The additional application count data is gated the same way as on the browse grid — Pro sees total count, Growth sees total plus category breakdown.

---

## Search results — vendor browse page (organisers searching for vendors)

This is the page organisers use to find vendors. The vendor's tier determines where they appear in results.

The default sort order when an organiser searches for vendors must be:
1. Growth vendors — always appear first within any given search result set
2. Pro vendors — appear second, below Growth vendors
3. Starter vendors — appear last, below Pro and Growth vendors

Within each tier group, vendors are sorted by their rating — highest rated Growth vendors appear before lower rated Growth vendors, etc.

If the organiser applies a specific sort order (for example sorting by "Most events completed"), the tier ranking is overridden by that sort and all vendors are sorted equally by the chosen metric. Tier-based ranking only applies to the default sort order.

The vendor's badge (Pro or Growth) must be visible on every vendor card in the search results grid so organisers can see tier status at a glance.

---

## Notification system — what each tier receives

All in-app and email notifications must be filtered by tier before being sent.

**Application status changes (approved, declined, withdrawn by organiser)** — all tiers receive this.

**New event posted matching cuisine and location:**
- Starter: No notification sent.
- Pro: Email notification sent within 2 hours of the event being posted.
- Growth: Push and email notification sent 24 hours before the equivalent Pro notification. If no Pro notification has gone out yet (because it is within the 24-hour Growth window), the notification subject line reads "Early access — new event in your area."

**Shortlist notification:**
- Starter: Not sent.
- Pro: Not sent.
- Growth: Sent instantly when an organiser shortlists their application. Notification reads: "[Organiser name] has shortlisted your application for [Event name]. You are in serious consideration — check your dashboard for details."

**Document expiry reminder (60 days before expiry):**
- Starter: Not sent.
- Pro: Sent.
- Growth: Sent.

**Organiser invitation received:**
- Starter: Sent after the Growth 48-hour window and Pro window have both closed.
- Pro: Sent after the Growth 48-hour exclusive window closes.
- Growth: Sent immediately when the organiser sends the invitation — 48 hours before Pro and Starter vendors are notified.

---

## Upgrade prompts — universal rules

Every upgrade prompt across the entire platform must follow these rules:

1. Never block the vendor from doing something they can do on their current plan. Only block or prompt on features that are genuinely tier-gated.

2. Every upgrade prompt must name the specific feature, name the specific plan that unlocks it, state the price, and have one CTA button. No vague "upgrade for more features" language.

3. The CTA button in every upgrade prompt must go directly to the billing section of the vendor's dashboard with the correct plan pre-selected and ready to activate — not to the public pricing page, not to a generic upgrade screen.

4. Upgrade prompts appear inline — as tooltips, disabled-state labels, or locked-section overlays. They do not appear as popups, modals, or interruptive banners. The vendor is never interrupted mid-task by an upgrade prompt.

5. After a vendor successfully upgrades their plan, all previously locked features must unlock immediately without requiring a page reload. The subscription state change propagates instantly through the session.

---

## Downgrade behaviour

When a vendor downgrades their plan, the following must happen:

Their subscription benefits end at the end of the current billing cycle — not immediately. They retain full access to their current plan's features until the cycle ends.

At the point the downgrade takes effect:
- Photos above the new tier limit are hidden on their public profile but not deleted. If they upgrade again the photos return. The vendor is shown a message in their profile editor: "You have 14 photos but your current plan allows 10. Your 4 most recently uploaded photos are hidden. Upgrade to restore them or delete photos to bring your total to 10."
- The vanity URL deactivates and reverts to the system URL. The vendor is notified by email before the downgrade takes effect.
- The second account user loses access. The account owner is notified before the downgrade.
- All analytics data is retained in the database but the analytics tab shows locked states matching the new plan.
- All application history, payment history, and documents are fully preserved regardless of plan.

---

## Free trial behaviour (Pro and Growth)

Both Pro and Growth offer a 14-day free trial.

During the trial:
- The vendor has full access to every feature of the plan they trialled.
- No credit card is required to start the trial.
- On day 10 of the trial, a banner appears at the top of their dashboard: "Your Pro trial ends in 4 days. Add a payment method to keep your features." With a link to billing settings.
- On day 13, the banner becomes more prominent and includes the specific features they will lose if they do not subscribe.
- On day 14, if no payment method has been added, the account automatically downgrades to Starter at midnight. All data is preserved. The vendor receives an email confirming the downgrade and listing the features they have lost access to.
- A vendor can only trial each plan once. If they have previously trialled Pro, they cannot start another Pro trial — they must subscribe. This is enforced at the account level.
