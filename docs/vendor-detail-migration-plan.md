# Vendor Detail Page Migration Plan

Migrating `pages/vendor-detail.html` (1,720 lines) to Next.js App Router.

Source: `pages/vendor-detail.html`
Target: `app/vendors/[userId]/page.jsx` + `components/vendors/detail/`
Pattern: Mirrors the existing `/vendors` list migration (server component page fetches data, passes to client shell) and extends the partial component migration already under `components/vendors/`.

---

## STEP 1 — Page Analysis

### Sections

| Section | Lines | Type | Description |
|---------|-------|------|-------------|
| Head / meta / fonts | 1–11 | Static | Favicon, fonts.css, title (dynamic, set by client JS) |
| CSS: tokens + body | 12–43 | Static | Brand CSS variables (identical to `globals.css`) + grain texture overlay |
| CSS: navbar | 45–92 | Static | Full navbar styles — replaced by `Navbar.jsx` |
| CSS: vendor hero banner | 93–109 | Static | 160px banner with bottom-left avatar (80px, offset -36px left 52px), breadcrumb top-left, initials watermark |
| CSS: page layout grid | 110–120 | Static | `max-width:1320px`, `1fr 360px` grid, 40px gap |
| CSS: vendor identity | 122–165 | Static | Name row (Fraunces clamp 28–42px), verified/pro/growth badges, meta row with cuisine/setup/suburb tags, bio |
| CSS: section blocks | 167–174 | Static | Divider pattern between sections with 20px heading |
| CSS: photo gallery | 176–203 | Static | 2-col grid, 180px tiles, hover scale+shadow, lightbox overlay |
| CSS: past events list | 205–230 | Static | Dotted rows with arrow, see-all button |
| CSS: reviews | 232–264 | Static | Sort buttons, review card (org-review/cust-review variants), load-more button |
| CSS: sidebar | 266–273 | Static | Sticky at top:84px, 16px gap between cards |
| CSS: rating summary | 274–294 | Static | 56px rating number, 5-row bars with gold fills, 20px heading count |
| CSS: stats grid | 296–301 | Static | 2×2 grid (events/member-since/response-rate/avg-setup) |
| CSS: plan badge | 303–312 | Static | Gradient row with dynamic colour per tier |
| CSS: document trust | 314–325 | Static | Green check badges + label list |
| CSS: invite button + dropdown | 327–349 | Static | Organiser-only button with upward-opening dropdown |
| CSS: upcoming appearances | 351–369 | Static | Chips with avatar square + name + date |
| CSS: lightbox | 371–392 | Static | Fullscreen overlay, 16:9 image frame, close button |
| CSS: toast | 394–401 | Static | Centered bottom pill, 2.4s auto-dismiss |
| CSS: footer | 403–416 | Static | Identical to other pages — replaced by `Footer.jsx` |
| CSS: contact modal | 418–502 | Static | Bottom-sheet drawer with subject/message fields and 500-char counter |
| CSS: what-they-sell + public menu | 504–548 | Static | Category pills, card grid, signature variant, unavailable fade |
| CSS: apply-to-same-markets | 550–563 | Static | Vendor-role chips linking to same events |
| CSS: responsive breakpoints | 564–581 | Static | 1024px collapses sidebar, 900px navbar mobile, 480px footer single-col |
| Nav HTML | 590–608 | Static → Client | Replaced by `Navbar.jsx` (already handles `__PITCH_USER__`) |
| Vendor hero banner | 610–622 | Dynamic | Initials, breadcrumb name, optional avatar_url background |
| Growth signature showcase | 630–639 | Dynamic | Fetches signature menu item via `/api/vendors/:id/menu`; only shown when `plan === 'growth'` |
| Vendor identity block | 641–651 | Dynamic | Name, verified/pro/growth badges, cuisine/setup/suburb/price tags, bio |
| Photo gallery | 653–657 | Dynamic | Renders from `vendor.photos` array; opens lightbox |
| Menu section | 665–675 | Dynamic | Category filter pills + card grid; fetched from `/api/vendors/:id/menu` |
| Past events | 678–741 | Hardcoded (currently replaced with "no events" stub for real vendors) | Needs real API wiring (see API Calls below) |
| Organiser reviews | 744–793 | Hardcoded (currently replaced with "no reviews" stub for real vendors) | Needs real API wiring |
| Consumer reviews | 796–803 | Demo only (from `CONSUMER_REVIEWS` map, slug-based only) | Keep hidden for real DB vendors; drop static demo data |
| Contact button (organiser) | 811–813 | Role-gated | Opens contact modal |
| Apply-to-same-markets card (vendor) | 816–837 | Role-gated | Vendor-only sidebar block |
| Rating summary card | 840–875 | Dynamic | Hidden for real DB vendors (no review data yet); kept for demo |
| Stats card | 878–899 | Dynamic | Hidden for real DB vendors |
| Plan badge card | 902–910 | Dynamic | Growth/Pro/Starter styling, name, description, icon |
| Document trust card | 913–929 | Dynamic | Shows only verified docs (`abn_verified`, `food_safety_url`, `pli_url`, `council_url`) |
| Invite card (organiser) | 932–955 | Role-gated | Currently static dropdown (needs real upcoming-events wiring) |
| Upcoming appearances card | 958–986 | Dynamic | Currently hardcoded demo; real data needs `/api/vendors/:userId/appearances` (does not yet exist) |
| Contact modal | 993–1016 | Interactive | Subject + message, 500-char counter; `sendContactMessage()` is a dead stub — needs wiring to `/api/messages` |
| Lightbox | 1019–1025 | Interactive | Opens on gallery click, ESC closes |
| Toast | 1028 | Interactive | 2.4s auto-dismiss success/info message |
| Footer | 1031–1081 | Static | Replaced by `Footer.jsx` |
| JS: page init + `applyDbVendor` | 1084–1174 | Client logic | Sets breadcrumb, name, plan badge, meta row, bio, signature showcase |
| JS: `applyAndReveal` | 1176–1265 | Client logic | Hero avatar/initials, gallery render, stats-card hiding, verified badge, doc-list, contact button toggle, menu load |
| JS: demo slug branch | 1288–1461 | Client logic | Falls back to static `PITCH_VENDORS` (from `/data.js`), merges DB plan over static — to be dropped entirely |
| JS: gallery lightbox | 1464–1485 | Client logic | `openLightbox()`, `closeLightbox()`, ESC key |
| JS: past-events toggle | 1489–1495 | Client logic | `togglePastEvents()` — demo only |
| JS: reviews load-more + sort | 1497–1537 | Client logic | `loadMoreReviews()` + `setSort()` — demo only |
| JS: invite dropdown | 1539–1547 | Client logic | `toggleInviteDropdown()` + outside-click close |
| JS: follow / unfollow | 1549–1561 | Client logic | `toggleFollow()` — dead stub (no API call, updates only local count) |
| JS: contact modal | 1563–1602 | Client logic | Open/close, ESC, char counter — `sendContactMessage()` does not POST |
| JS: renderWhatTheySell | 1604–1616 | Client logic | Menu item pill rendering (used only when items exist) |
| JS: role-based UI toggles | 1629–1640 | Client logic | `?role=vendor` or `?role=organiser` query-param debug toggles |
| JS: public menu (`loadPublicMenu`, `renderPublicMenu`, `filterPublicMenu`) | 1642–1716 | Client logic | Fetches `/api/vendors/:id/menu`, groups by category, filters by category pill, renders card grid |

### API Calls

| Endpoint | Method | Returns | Used for | Source |
|----------|--------|---------|----------|--------|
| `GET /vendors/:userId` | GET (page) | HTML with `window.__PITCH_VENDOR__` injected | Initial page render for numeric IDs | serve.mjs:5423 |
| `GET /api/vendors/:userId` | GET | `{ vendor: {...} }` (full vendor row, `photos` + `cuisine_tags` parsed, `password_hash` stripped) | Client fallback + slug page live overlay | serve.mjs:1745 |
| `GET /api/vendors/:userId/menu` | GET | `MenuItem[]` — each with `name`, `description`, `photo_url`, `price_type`, `price_min`, `price_max`, `is_signature`, `seasonal`, `available`, `category`, `dietary_tags` | Menu grid + Growth signature showcase | serve.mjs:5061 |
| `GET /api/vendors` | GET | `{ vendors: [...] }` | Demo-slug branch live overlay (to be dropped) | serve.mjs:1712 |
| `POST /api/messages` | POST | `{ thread_key, thread }` | Create/get message thread (organiser → vendor) — **new wiring required** | serve.mjs:3008 |
| `POST /api/messages/:threadKey` | POST | `{ message }` | Send contact message — **new wiring required** | serve.mjs:3035 |

Endpoints that do not yet exist but are referenced visually and should be stubbed or hidden until built:

| Endpoint | Purpose | Plan |
|----------|---------|------|
| `GET /api/vendors/:userId/past-events` | Past events list | Hide section for real vendors until built |
| `GET /api/vendors/:userId/reviews` | Organiser + consumer reviews | Hide section for real vendors until built |
| `GET /api/vendors/:userId/appearances` | Upcoming appearances chips | Hide section for real vendors until built |
| `GET /api/vendors/:userId/stats` | Events-done / response-rate / member-since / avg-setup | Hide stats/rating cards for real vendors until built |
| `POST /api/vendors/:userId/follow` | Follow / unfollow vendor | Drop follow button from migration (dead button) |

### Client-Side Interactivity

- Lightbox: click gallery tile → open full-size image, ESC or click overlay to close
- Menu category pills: click pill → filter menu cards by category (`'All'` = no filter)
- Reviews sort pills: Most Recent / Highest Rated (demo-only toggle for now)
- Past events toggle: See all N → Show less (demo-only for now)
- Load-more reviews: injects additional hardcoded cards (demo-only for now)
- Invite dropdown: organiser-only; opens upward, closes on outside click (needs real upcoming-events wiring)
- Contact modal: organiser-only; subject input, 500-char message textarea with counter, send button disabled until ≥5 chars — needs real POST wiring
- Toast: success/info message that auto-dismisses in 2.4s
- Hide-until-ready: `html.vd-loading` class prevents FOUC until vendor data applied

### Data Shape — `/api/vendors/:userId` response

Each vendor row from `stmts.publicVendorById`:
- `user_id`, `trading_name`, `slug`, `suburb`, `state`, `bio`
- `cuisine_tags` (parsed JSON array)
- `setup_type`, `price_range`, `plan`, `status`
- `avatar_url`, `photos` (parsed JSON array of URLs)
- `abn_verified`, `food_safety_url`, `pli_url`, `council_url`
- Created/updated timestamps

### Data Shape — `/api/vendors/:userId/menu` response

Array of menu items:
- `id`, `name`, `description`, `category`
- `price_type` (`exact` | `range` | `varies`), `price_min`, `price_max`
- `is_signature`, `seasonal`, `available`
- `photo_url`
- `dietary_tags` (JSON array or string)

---

## STEP 2 — Route Structure Decision

The current Express route is `/vendors/:id` where `id` is either a numeric `user_id` (real DB vendor) or a slug (static demo vendor from `data.js`).

**Decision: use `app/vendors/[userId]/page.jsx` with a numeric `userId` param.**

Reasoning:
1. `GET /api/vendors/:userId` at [serve.mjs:1745](serve.mjs#L1745) confirms the API contract is `userId`-based.
2. The vendors list migration already links to `/vendors/{userId}` via `VendorCard.jsx` (maps `vendor.slug` which falls back to `vendor.user_id` in `mapVendorForCard`).
3. Demo slug-based vendors from `data.js` are a legacy prototype pattern slated for removal — the migrated page will not support them. If a user hits `/vendors/smoky-joes-bbq`, the page will `notFound()`.
4. A future slug column can be added to the DB and handled as `app/vendors/[slug]/page.jsx` — that migration would be additive.

---

## STEP 3 — Existing Reusable Components

### Direct reuse (no changes needed)

| Component | File | How it's used |
|-----------|------|---------------|
| `Navbar` | [components/Navbar.jsx](components/Navbar.jsx) | Replaces inline navbar + `__PITCH_USER__` auth script (already accepts `user` prop) |
| `Footer` | [components/Footer.jsx](components/Footer.jsx) | Replaces inline footer HTML |

### Reuse from the partial `/vendors` migration

None of the `components/vendors/` files (`VendorsPage.jsx`, `VendorsGrid.jsx`, `VendorFilters.jsx`, `VendorResultsMeta.jsx`) apply to the detail page — they serve the list/browse flow. They will remain untouched.

### Existing shared infra

| Utility | File | Use |
|---------|------|-----|
| `config.apiBase` | [lib/config.js](lib/config.js) | Used by all new `fetchVendor*()` functions |
| `parseCuisineTags()` / `generateAvatarGradient()` / `PLAN_DISPLAY_LABELS` | [lib/data/vendors.js](lib/data/vendors.js) | Reuse for `mapVendorForDetail` (extend current module) |
| `ROUTES` | [constants/routes.js](constants/routes.js) | Breadcrumb links, back-to-vendors link |

---

## STEP 4 — Shared Components for Future Reuse

The vendor detail page and the (not-yet-migrated) event detail page have structurally identical layouts: hero banner → left column of content blocks (gallery, related items, reviews) + sticky right sidebar (stats, trust/verification, CTAs). The same is true for organiser profile pages that may come later.

**Decision: create a new `components/shared/` directory now** and put primitives for the detail layout there from the start. This prevents the event-detail migration from either duplicating or having to retrofit-extract later.

Shared primitives introduced by this migration:

| Component | File | Purpose | Future reuse |
|-----------|------|---------|--------------|
| `DetailLayout` | `components/shared/DetailLayout.jsx` | Main two-column grid (`1fr 360px`, collapses to single-col at 1024px). Content via `left` + `sidebar` slots. | Vendor detail, event detail, organiser profile |
| `DetailHero` | `components/shared/DetailHero.jsx` | 160px banner with bottom-anchored avatar slot, top breadcrumb slot, optional background image, initials watermark | Vendor detail, event detail |
| `Breadcrumb` | `components/shared/Breadcrumb.jsx` | `Home / Section / Current` with ember-hover links | Vendor detail, event detail, blog posts |
| `SidebarCard` | `components/shared/SidebarCard.jsx` | Wrapper with `--char` bg, 16px radius, 24px padding, optional `heading` prop | All detail sidebars |
| `SectionBlock` | `components/shared/SectionBlock.jsx` | Left-column content block with dotted top divider and 20px Fraunces heading; optional `variant="alt"` for `--char` panel look | All detail left columns |
| `Lightbox` | `components/shared/Lightbox.jsx` | Fullscreen image overlay with ESC close, caption, and prev/next stub | Vendor gallery, event gallery |
| `Toast` | `components/shared/Toast.jsx` | Imperative `showToast(msg)` via a small store; 2.4s auto-dismiss | Global |
| `RatingBars` | `components/shared/RatingBars.jsx` | 5-row bar chart with gold fills, animated on mount | Vendor reviews, event reviews |
| `VerifiedDocsList` | `components/shared/VerifiedDocsList.jsx` | Green-check list from `{ label, ok }` items array | Vendor detail, organiser profile |
| `PlanBadgeCard` | `components/shared/PlanBadgeCard.jsx` | Gradient row with name/description/icon, styled by `plan` prop (`growth`/`pro`/`free`) | Vendor detail, vendor dashboard, organiser profile |
| `EmptyState` | `components/shared/EmptyState.jsx` | Icon + heading + body + optional action (CLAUDE.md Law 3 empty-state pattern) | Every list/section on every page |

Detail-specific components (vendor-only, live in `components/vendors/detail/`):

| Component | File | Purpose |
|-----------|------|---------|
| `VendorDetailPage.jsx` | client orchestrator | Reads `vendor` prop, user prop, local state for menu filter / lightbox / contact modal |
| `VendorHeroBanner.jsx` | client | Renders `DetailHero` with vendor-specific initials watermark, avatar, breadcrumb name |
| `VendorIdentity.jsx` | client | Name + badges + meta row + bio block |
| `VendorGallery.jsx` | client | Gallery grid + lightbox trigger |
| `VendorMenu.jsx` | client | Category filter pills + card grid, handles signature card variant |
| `VendorSignatureShowcase.jsx` | client | Growth-tier signature item banner (fetches from menu) |
| `VendorRatingCard.jsx` | client | Rating number + bars (fed by future reviews API, hidden until then) |
| `VendorStatsCard.jsx` | client | 2×2 stats grid (fed by future stats API, hidden until then) |
| `VendorAppearancesCard.jsx` | client | Upcoming event chips (fed by future API, hidden until then) |
| `VendorContactModal.jsx` | client | Organiser-only; POSTs to `/api/messages` + `/api/messages/:threadKey` |

---

## STEP 5 — Data Layer

### New functions to add to `lib/data/vendors.js`

| Function | Endpoint | Returns | Notes |
|----------|----------|---------|-------|
| `fetchVendorByUserId(userId)` | `GET /api/vendors/:userId` | `Vendor \| null` | Returns mapped detail shape; returns `null` on 404 so page can `notFound()` |
| `fetchVendorMenu(userId)` | `GET /api/vendors/:userId/menu` | `MenuItem[]` | Returns empty array on error (Law 5 typed safe fallback) |
| `mapVendorForDetail(vendor)` | — | Mapped vendor | Richer than `mapVendorForCard`: includes `photos`, all doc URLs, price_range, state, bio |

Each function follows the exact CLAUDE.md error-handling pattern: try/catch, `response.ok` check, `console.error` with `[functionName]`, endpoint, status, timestamp, typed fallback.

### `mapVendorForDetail(vendor)` shape

```
{
  userId: vendor.user_id,
  slug: vendor.slug ?? String(vendor.user_id),
  name: vendor.trading_name ?? '',
  bio: vendor.bio ?? '',
  suburb: vendor.suburb ?? '',
  state: vendor.state ?? '',
  cuisines: parseCuisineTags(vendor.cuisine_tags),
  setupType: vendor.setup_type ?? '',
  priceRange: vendor.price_range ?? null,
  plan: vendor.plan ?? 'free',
  planLabel: PLAN_DISPLAY_LABELS[vendor.plan] ?? 'Starter',
  avatarUrl: vendor.avatar_url ?? null,
  avatarGradient: generateAvatarGradient(vendor.trading_name ?? ''),
  initials: deriveInitials(vendor.trading_name ?? ''),
  photos: Array.isArray(vendor.photos) ? vendor.photos : [],
  documents: {
    abnVerified: !!vendor.abn_verified,
    foodSafetyUrl: vendor.food_safety_url ?? null,
    pliUrl: vendor.pli_url ?? null,
    councilUrl: vendor.council_url ?? null,
  },
  isVerified: !!vendor.food_safety_url && !!vendor.pli_url,
}
```

---

## STEP 6 — File Plan

### New files to create

| File | Lines (est.) | Purpose | Type |
|------|-------------|---------|------|
| `app/vendors/[userId]/page.jsx` | ~40 | Server component — fetches vendor + menu, passes to client shell, handles `notFound()` | Server |
| `app/vendors/[userId]/not-found.jsx` | ~25 | Vendor-not-found state with CTA back to browse | Server |
| `components/vendors/detail/VendorDetailPage.jsx` | ~180 | Client shell — orchestrates sections, role-based UI, menu filter state | Client |
| `components/vendors/detail/VendorDetailPage.module.css` | ~40 | Page-level tokens (section spacing, responsive) | CSS Module |
| `components/vendors/detail/VendorHeroBanner.jsx` | ~50 | Wraps `DetailHero` with avatar image or initials + background | Client |
| `components/vendors/detail/VendorHeroBanner.module.css` | ~60 | Banner-specific styles | CSS Module |
| `components/vendors/detail/VendorIdentity.jsx` | ~55 | Name row, badges, meta row, bio | Client |
| `components/vendors/detail/VendorIdentity.module.css` | ~80 | Identity styles (name, tags, badges) | CSS Module |
| `components/vendors/detail/VendorGallery.jsx` | ~45 | Gallery grid that opens shared `Lightbox` | Client |
| `components/vendors/detail/VendorGallery.module.css` | ~40 | Gallery layout | CSS Module |
| `components/vendors/detail/VendorMenu.jsx` | ~120 | Category pills + card grid + signature card variant | Client |
| `components/vendors/detail/VendorMenu.module.css` | ~110 | Menu pill + card styles | CSS Module |
| `components/vendors/detail/VendorSignatureShowcase.jsx` | ~55 | Growth-tier signature item banner | Client |
| `components/vendors/detail/VendorSignatureShowcase.module.css` | ~35 | Showcase styles | CSS Module |
| `components/vendors/detail/VendorContactModal.jsx` | ~110 | Bottom-sheet drawer, POSTs to `/api/messages` + `/api/messages/:threadKey`, toast feedback | Client |
| `components/vendors/detail/VendorContactModal.module.css` | ~90 | Modal drawer styles | CSS Module |
| `components/shared/DetailLayout.jsx` | ~30 | Two-column grid shell | Client |
| `components/shared/DetailLayout.module.css` | ~25 | Grid + responsive | CSS Module |
| `components/shared/DetailHero.jsx` | ~40 | 160px banner with slots | Client |
| `components/shared/DetailHero.module.css` | ~50 | Banner styles | CSS Module |
| `components/shared/Breadcrumb.jsx` | ~25 | Breadcrumb with `items` prop | Client |
| `components/shared/Breadcrumb.module.css` | ~15 | Breadcrumb styles | CSS Module |
| `components/shared/SidebarCard.jsx` | ~20 | Sidebar wrapper with optional heading | Client |
| `components/shared/SidebarCard.module.css` | ~25 | Card styles | CSS Module |
| `components/shared/SectionBlock.jsx` | ~20 | Left-column block with heading + optional alt bg | Client |
| `components/shared/SectionBlock.module.css` | ~25 | Block styles | CSS Module |
| `components/shared/Lightbox.jsx` | ~60 | Fullscreen image viewer with ESC + caption | Client |
| `components/shared/Lightbox.module.css` | ~35 | Lightbox styles | CSS Module |
| `components/shared/Toast.jsx` | ~45 | Imperative toast store + renderer | Client |
| `components/shared/Toast.module.css` | ~15 | Toast styles | CSS Module |
| `components/shared/RatingBars.jsx` | ~45 | 5-row bar chart with mount animation | Client |
| `components/shared/RatingBars.module.css` | ~25 | Bar styles | CSS Module |
| `components/shared/VerifiedDocsList.jsx` | ~30 | Green-check list | Client |
| `components/shared/VerifiedDocsList.module.css` | ~30 | Doc-list styles | CSS Module |
| `components/shared/PlanBadgeCard.jsx` | ~50 | Plan-tier badge row (Growth/Pro/Starter) | Client |
| `components/shared/PlanBadgeCard.module.css` | ~40 | Plan badge styles | CSS Module |
| `components/shared/EmptyState.jsx` | ~35 | Heading + body + action button (Law 3) | Client |
| `components/shared/EmptyState.module.css` | ~25 | Empty state styles | CSS Module |

### Existing files to modify

| File | Changes |
|------|---------|
| `lib/data/vendors.js` | Add `fetchVendorByUserId()`, `fetchVendorMenu()`, `mapVendorForDetail()`, and a small `deriveInitials()` helper |
| `constants/timing.js` | Add `TOAST_DISMISS_MS = 2400`, `LIGHTBOX_ANIMATION_MS = 180` |
| `constants/limits.js` | Add `CONTACT_MESSAGE_MAX_CHARS = 500`, `CONTACT_MESSAGE_MIN_CHARS = 5`, `VENDOR_HERO_BANNER_HEIGHT_PX = 160` |
| `constants/ui.js` | Add `VENDOR_PRICE_LABELS` map (`'$'`, `'$$'`, `'$$$'` → full phrases), `VENDOR_DOC_LABELS` map |
| `next.config.mjs` | Remove only the `/vendors/:path*` rewrite (which currently routes vendor detail pages to Express). Keep all other vendor-adjacent rewrites. |

---

## STEP 7 — Detailed File Specifications

### `app/vendors/[userId]/page.jsx` (server component, ~40 lines)

```
Params: { userId: string }
Data: Promise.all([fetchVendorByUserId(userId), fetchVendorMenu(userId)])
Guards: if (!vendor) return notFound()
Guards: if (!/^\d+$/.test(userId)) return notFound()
Renders: <Suspense fallback=""><VendorDetailPage vendor={vendor} menu={menu} user={currentUser} /></Suspense>
Metadata: dynamic title `${vendor.name} — Pitch.`, description from vendor.bio
User: currentUser fetched from session (server-side); passed to client shell for role-gated UI
```

### `components/vendors/detail/VendorDetailPage.jsx` (client, ~180 lines)

```
Props: { vendor, menu, user }
State: lightbox: { isOpen, photoIndex }, isContactModalOpen: boolean
Derived: isOrganiserViewer = user?.role === 'organiser'
Derived: isOwnProfile = user?.id === vendor.userId
Derived: isGrowth = vendor.plan === 'growth'

Layout:
  <Navbar user={user} />
  <VendorHeroBanner vendor={vendor} />
  <DetailLayout
    left={<>
      {isGrowth && <VendorSignatureShowcase menu={menu} />}
      <VendorIdentity vendor={vendor} />
      <SectionBlock variant="alt" heading="Photos">
        <VendorGallery photos={vendor.photos} onOpen={handleLightboxOpen} />
      </SectionBlock>
      {menu.length > 0 && (
        <SectionBlock heading="Menu">
          <VendorMenu items={menu} showOwnerEditLink={isOwnProfile} />
        </SectionBlock>
      )}
      {/* Past events, reviews, consumer reviews hidden until APIs exist */}
    </>}
    sidebar={<>
      {isOrganiserViewer && !isOwnProfile && (
        <button onClick={openContactModal} ...>Contact vendor</button>
      )}
      <PlanBadgeCard plan={vendor.plan} />
      <SidebarCard heading="Documents">
        <VerifiedDocsList items={buildDocsList(vendor.documents)} />
      </SidebarCard>
      {/* Rating, Stats, Appearances cards hidden until APIs exist */}
    </>}
  />
  <Footer />
  <Lightbox state={lightbox} photos={vendor.photos} onClose={handleLightboxClose} />
  {isContactModalOpen && (
    <VendorContactModal vendorUserId={vendor.userId} vendorName={vendor.name} organiserUserId={user.id} onClose={closeContactModal} />
  )}
```

### `components/vendors/detail/VendorContactModal.jsx` (client, ~110 lines)

```
Props: { vendorUserId, vendorName, organiserUserId, onClose }
State: subject: string, body: string, isSubmitting: boolean

Submit flow:
  1. Open/create thread: POST /api/messages { vendor_user_id, organiser_user_id } → thread_key
  2. Send message: POST /api/messages/:thread_key { body: subject ? `${subject}\n\n${body}` : body }
  3. On success: showToast('Message sent') + onClose()
  4. On failure: showToast('Could not send — try again') + keep modal open

Validation: body.trim().length >= CONTACT_MESSAGE_MIN_CHARS
Counter: body.length / CONTACT_MESSAGE_MAX_CHARS
Wiring: replaces current dead `sendContactMessage()` stub (CLAUDE.md backend-first)
```

### `components/vendors/detail/VendorMenu.jsx` (client, ~120 lines)

```
Props: { items: MenuItem[], showOwnerEditLink: boolean }
State: activeCategory: string (default 'All')
Derived: categories = ['All', ...new Set(items.map(i => i.category).filter(Boolean))]
Derived: filteredItems = activeCategory === 'All' ? items : items.filter(i => i.category === activeCategory)

Render:
  - Header row: "Menu" heading + optional "Edit menu" link (/dashboard/vendor#menu) for own profile
  - Pill row: category filter pills (active/inactive states)
  - Card grid: signature cards full-width with photo-left body-right, regular cards 220px min
  - Each card: photo (or emoji placeholder), name, price (formatted), description, badge row (signature/seasonal/unavailable/category/dietary tags)
  - Empty state: hidden at parent level (menu section only renders if items.length > 0)

Price formatter:
  - 'exact' + price_min → $12.00
  - 'range' + price_min + price_max → $8.00–$14.00
  - 'varies' → 'Varies'

Escapes all strings via DOM text nodes (not innerHTML)
```

### `components/shared/Lightbox.jsx` (client, ~60 lines)

```
Props: { state: { isOpen, photoIndex }, photos: string[], onClose }
Effect: attaches keydown ESC listener when open, cleans up on close
Effect: locks document.body.scrollbar when open (--overflow: hidden)
Render:
  - Portal to document.body (via createPortal)
  - Overlay div with click-to-close
  - Inner frame 16:9, photo as <Image> (optional Next/Image) or <img>
  - Close button top-right
  - Optional caption
  - ESC key → onClose()
Accessibility: focus trap on open, focus restore on close, aria-modal="true", aria-label="Photo viewer"
```

### `components/shared/Toast.jsx` (client, ~45 lines)

```
Export: a singleton store with `showToast(message)` imperative API
Render: single <Toast /> component mounted in app layout
Implementation: tiny useSyncExternalStore pattern, auto-dismiss after TOAST_DISMISS_MS
No toast library dependency
```

---

## STEP 8 — New Constants

### `constants/timing.js` additions

```javascript
// Vendor detail toast auto-dismisses after this duration.
// 2.4s matches existing UX in pages/vendor-detail.html and gives
// enough time to read without blocking further interaction.
export const TOAST_DISMISS_MS = 2400

// Lightbox fade-in duration when a gallery image opens.
export const LIGHTBOX_ANIMATION_MS = 180
```

### `constants/limits.js` additions

```javascript
// Maximum length of a vendor-contact message body.
// Matches the maxlength attribute on the current textarea and
// the size limit in POST /api/messages/:threadKey.
export const CONTACT_MESSAGE_MAX_CHARS = 500

// Minimum body length before the Send button enables.
// Five chars prevents empty or accidental submissions.
export const CONTACT_MESSAGE_MIN_CHARS = 5

// Fixed height for the vendor detail hero banner.
// Kept in constants because the avatar is positioned absolute
// relative to this height; changing the banner requires also
// adjusting the avatar offset.
export const VENDOR_HERO_BANNER_HEIGHT_PX = 160
```

### `constants/ui.js` additions

```javascript
// Price range labels surfaced on the vendor meta row.
// Keys match the vendors.price_range column values.
export const VENDOR_PRICE_LABELS = {
  '$':   '$ (under $15)',
  '$$':  '$$ ($15–$25)',
  '$$$': '$$$ ($25+)',
}

// Document trust labels shown in the vendor sidebar.
// Keys map to the flags on mapVendorForDetail(vendor).documents.
export const VENDOR_DOC_LABELS = {
  abnVerified:   'ABN Verified',
  foodSafetyUrl: 'Food Safety Certificate',
  pliUrl:        'Public Liability Insurance',
  councilUrl:    'Council Permit',
}
```

---

## STEP 9 — `next.config.mjs` Changes

The vendors-page migration kept the `/vendors/:path*` rewrite so vendor detail pages remained served by Express. This migration removes that rewrite:

```javascript
// REMOVE:
{ source: '/vendors/:path*', destination: `${expressBaseUrl}/vendors/:path*` },
```

After removal, `/vendors/123` is served by `app/vendors/[userId]/page.jsx`. Non-numeric paths (legacy demo slugs) fall into `not-found.jsx` and show a redirect CTA back to `/vendors`.

---

## STEP 10 — Dead-Button Audit

Existing prototype behavior to **not carry forward** (CLAUDE.md: no dead buttons, no cosmetic-only features):

| Element | Current behavior | Plan |
|---------|------------------|------|
| `toggleFollow()` | Local-only state, no API | Drop button entirely from migration — no follow API exists yet |
| `loadMoreReviews()` | Injects hardcoded HTML | Drop — real reviews API does not exist; section hidden for real vendors |
| `togglePastEvents()` | Toggles hidden hardcoded block | Drop — real past-events API does not exist |
| `setSort()` | Visual-only button state | Drop — sort meaningless without real review data |
| Invite dropdown "Send invitation" | Static dropdown, no action | Drop from migration — re-introduce when invite API is built |
| `sendContactMessage()` stub | Closes modal + fake toast | **Replace** with real POST to `/api/messages` + `/api/messages/:threadKey` |
| `?role=vendor` / `?role=organiser` URL toggles | Dev hack for role preview | Drop — role comes from server-side session `user.role` |

Items re-enabled with real wiring: contact modal only. Everything else gets removed until the backing API exists.

---

## STEP 11 — Shared Component Reuse Summary

| Vendor detail component | Event detail (future) reuse |
|-------------------------|---------------------------|
| `DetailLayout` | Direct reuse |
| `DetailHero` | Direct reuse (slots differ: event hero shows event date badge and venue chips) |
| `Breadcrumb` | Direct reuse |
| `SidebarCard` | Direct reuse |
| `SectionBlock` | Direct reuse |
| `Lightbox` | Direct reuse |
| `Toast` | Global — already shared |
| `RatingBars` | Direct reuse for event organiser ratings |
| `VerifiedDocsList` | Direct reuse on organiser profile |
| `PlanBadgeCard` | Direct reuse on vendor dashboard + organiser profile |
| `EmptyState` | Global — every list/section on every page |
| `VendorHeroBanner` | Not reused — event hero will be its own component |
| `VendorIdentity` | Not reused |
| `VendorGallery` | Not reused — event will have its own gallery component using same `Lightbox` |
| `VendorMenu` | Not reused |
| `VendorContactModal` | **Parameterise later** when organiser contact flows from event pages are built — same `/api/messages` pattern |

The investment in `components/shared/` pays off across at least four future migrations (event detail, organiser profile, foodie-followed-vendor card, public event-organiser page).

---

## STEP 12 — Migration Order

Execute in this exact sequence:

1. **Constants** — Add timing, limits, ui additions
2. **Shared primitives** — `components/shared/*.jsx` + modules (DetailLayout, DetailHero, Breadcrumb, SidebarCard, SectionBlock, Lightbox, Toast, RatingBars, VerifiedDocsList, PlanBadgeCard, EmptyState)
3. **Data layer** — Add `fetchVendorByUserId`, `fetchVendorMenu`, `mapVendorForDetail`, `deriveInitials` to `lib/data/vendors.js`
4. **Detail components** — `components/vendors/detail/` (HeroBanner, Identity, Gallery, Menu, SignatureShowcase, ContactModal)
5. **Page shell** — `VendorDetailPage.jsx` + module
6. **Route** — `app/vendors/[userId]/page.jsx` + `not-found.jsx`
7. **Rewrites** — Remove `/vendors/:path*` from `next.config.mjs`
8. **Verify** — Run verification checklist below

---

## STEP 13 — Verification

### Local test

1. `node serve.mjs` — Express backend on :3000 (provides `/api/vendors/:userId` and `/api/messages*`)
2. `npm run dev` — Next.js dev server
3. Get a real vendor `user_id` from the DB: `sqlite3 ~/.pitch.db 'select user_id, trading_name from vendors where status="active" limit 5;'` (or via admin dashboard)
4. Visit `http://localhost:3001/vendors/<userId>`
5. `node screenshot.mjs http://localhost:3001/vendors/<userId> vendor-detail` and compare against `pages/vendor-detail.html` at the same URL served by Express

### Golden-path checks (Law 3: all four states)

- **Loading**: server render means no client flash; skeletons not required but content should mount without FOUC
- **Error**: network failure on `fetchVendorByUserId` → returns `null` → `notFound()` → `not-found.jsx` renders CTA back to `/vendors`
- **Empty (menu)**: menu section hidden when `menu.length === 0`
- **Empty (photos)**: photos grid shows "No gallery photos yet" fallback
- **Success**: vendor identity, meta row, badges, plan card, documents render correctly

### Role-gated checks

- Logged out → no contact button, no invite section
- Logged in as organiser (not this vendor) → contact button visible; clicking opens modal; sending posts to `/api/messages` and `/api/messages/:threadKey`; toast shows "Message sent"; thread appears in organiser inbox
- Logged in as this vendor (own profile) → "Edit menu" link visible next to Menu heading; no contact button
- Logged in as different vendor → no contact button, no own-profile link
- Logged in as foodie → no contact button, no invite section

### Growth-tier checks

- Vendor with `plan === 'growth'` and a signature menu item → signature showcase banner renders at top of left column with name, description, price
- Vendor with `plan === 'growth'` and no signature menu item → showcase hidden
- Vendor with `plan === 'pro'` or `plan === 'free'` → showcase hidden

### Documents checks

- Vendor with `abn_verified` only → ABN Verified row
- Vendor with all docs → four rows (ABN, Food Safety, PLI, Council)
- Vendor with no docs → "No documents uploaded yet."
- Verified badge (next to vendor name) shows only when `food_safety_url` AND `pli_url` both present

### Menu checks

- Menu pills: "All" + distinct categories
- Filtering: clicking a category pill shows only those items; "All" shows everything
- Signature items render full-width with `is-sig` variant styling
- Unavailable items render at 45% opacity with "Not available today" badge
- Price formatter handles `exact`, `range`, `varies`

### Dead-button regression check

- No follow button present
- No "Load more reviews" visible (reviews section hidden for real vendors)
- No "See all events" visible (past events section hidden for real vendors)
- No invite dropdown visible (hidden until real upcoming-events API exists)
- No `?role=` URL param toggles (role comes from session only)

### Not-found check

- `/vendors/999999` (non-existent userId) → `not-found.jsx` with "Vendor not found" + "Browse all vendors" CTA
- `/vendors/smoky-joes-bbq` (legacy slug) → same `not-found.jsx` (non-numeric fails the regex guard)

---

## Key Decisions

1. **Route uses `[userId]` not `[slug]`.** The current `/api/vendors/:userId` endpoint is authoritative and vendor rows don't yet have a slug column. When a slug column is added later, a supplementary `app/vendors/[slug]/page.jsx` route can be introduced additively.

2. **Drop static demo vendors entirely.** The current page has a 170-line branch for `PITCH_VENDORS` from `data.js` with hardcoded reviews, appearances, past events, consumer reviews. The migrated page only handles real DB vendors. Legacy slug URLs (`/vendors/smoky-joes-bbq`) show the not-found page.

3. **Hide placeholder sections that lack real APIs.** Rating summary, stats grid, upcoming appearances, past events, reviews (organiser + consumer) all currently show either hardcoded demo data or empty stubs. The migration hides these sections entirely for real vendors. Each section comes back in its own PR once the backing API exists. This avoids "cosmetic-only features" that violate CLAUDE.md backend-first rule.

4. **Wire the contact modal properly.** The current `sendContactMessage()` just closes the modal and shows a fake toast — a dead button. The migration wires it to the real `/api/messages` + `/api/messages/:threadKey` flow that exists in `serve.mjs`. This is the one dead button that gets replaced rather than dropped.

5. **Create `components/shared/` now.** Detail-page primitives (DetailLayout, DetailHero, Lightbox, Toast, RatingBars, PlanBadgeCard, EmptyState, etc.) are reused by the vendor detail, the upcoming event detail, and the eventual organiser profile. Extracting them during the first detail-page migration prevents duplicate implementations that would need retrofit-extraction later.

6. **Server-side data fetch, not client-side.** The current page is 100% client-rendered with `html.vd-loading` hide-until-ready. The migration moves all fetches into the server component, eliminating FOUC and improving initial paint. User role comes from the session server-side and is passed to the client shell for role-gated UI.

7. **Shared components go in `components/shared/`, vendor-specific detail components go in `components/vendors/detail/`.** Keeps shared primitives at a top-level directory that other detail migrations can import from without reaching into a sibling feature's folder. `components/vendors/detail/` naming mirrors the pattern of `components/vendors/` (browse components) and `components/events/` (list components).