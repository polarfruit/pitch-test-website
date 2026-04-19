# Vendors Page Migration Plan

Migrating `pages/vendors.html` (713 lines) to Next.js App Router.

Source: `pages/vendors.html`
Target: `app/vendors/page.jsx` + `components/vendors/`
Pattern: Mirrors the existing `/events` migration (server component page + client component shell)

---

## STEP 1 — Page Analysis

### Sections

| Section | Lines | Type | Description |
|---------|-------|------|-------------|
| Head / meta / SEO | 1–22 | Static | Title, description, OG tags, canonical URL, font preloads |
| CSS reset + brand tokens | 23–56 | Static | CSS variables (identical to brand system in `globals.css`) |
| Navbar styles + HTML | 58–303 | Static | Full navbar with logged-in/out states — replaced by `Navbar.jsx` |
| Page hero | 306–313 | Static | Section tag, title with count, subline |
| Filter bar | 315–344 | Client | Search input, cuisine select, setup type select, sort select, hidden suburb/pro inputs |
| Vendor grid | 346–348 | Client | Empty `#vendor-grid` container populated by JS |
| Pagination | 349–354 | Client | Wrap, meta, page buttons — populated by JS |
| Footer | 357–401 | Static | Full footer — replaced by `Footer.jsx` |
| Static data script | 403 | Static | `<script src="/data.js">` — loads `window.PITCH_VENDORS` fallback data |
| JS: skeleton + fetch | 404–490 | Client | Shows skeleton, fetches `/api/vendors`, merges with static data, sorts by tier |
| JS: renderCard | 499–542 | Client | Builds vendor card HTML with avatar, tier badge, tags, stats |
| JS: filtering | 544–604 | Client | `getFiltered()`, `renderChips()`, `applyFilters()`, `clearFilters()` |
| JS: renderGrid | 606–625 | Client | Paginates filtered list, renders cards or empty state |
| JS: pagination | 627–679 | Client | `renderPagination()`, `goPage()` — ellipsis logic, prev/next |
| Location autocomplete | 681–684 | Client | Suburb filter via `pitchLocAC()` |
| Auth nav script | 685–711 | Client | Fetches `/api/me` to toggle logged-in nav state — handled by `Navbar.jsx` |

### API Calls

| Endpoint | Method | Returns | Used for |
|----------|--------|---------|----------|
| `GET /api/vendors` | GET | `{ vendors: [...] }` | Primary vendor list (DB rows with parsed `cuisine_tags`) |
| `GET /api/me` | GET | `{ user }` | Auth state for navbar (handled by existing `Navbar.jsx`) |

### Client-Side Interactivity

- Text search (filters by name or cuisine)
- Cuisine dropdown filter (BBQ, Mexican, Asian Fusion, Italian, Desserts, Coffee & Drinks, Vegan, Burgers, Seafood, Other)
- Setup type dropdown filter (Food Truck, Pop-up Stall, Cart)
- Sort dropdown (Pro tier priority, A-Z, Z-A)
- Active filter chips with individual clear
- Pagination (12 per page, ellipsis pattern)
- Skeleton loading state (8 skeleton cards)
- Empty state when no results
- Vendor cards link to `/vendors/{userId}`
- Suburb filter via location autocomplete (hidden input)

### Data Shape (from `/api/vendors`)

Each vendor row from the DB contains:
- `user_id`, `trading_name`, `suburb`, `state`, `bio`
- `cuisine_tags` (JSON string, parsed to array)
- `setup_type` (Food Truck / Pop-up Stall / Cart)
- `plan` (free / pro / growth)
- `avatar_url`
- `status`

Current page also merges with static `data.js` vendors for display enrichment (rating, reviews, events count, emoji, bg gradient). This merge logic should be handled server-side or in the data layer during migration.

---

## STEP 2 — Existing Reusable Components

### Direct reuse (no changes needed)

| Component | File | How it's used |
|-----------|------|---------------|
| `Navbar` | `components/Navbar.jsx` | Replaces inline navbar HTML + auth nav script |
| `Footer` | `components/Footer.jsx` | Replaces inline footer HTML |
| `Pagination` | `components/events/Pagination.jsx` | Identical pagination pattern (prev/next, ellipsis, active page) |
| `VendorCard` | `components/VendorCard.jsx` | Exists but needs modification (see below) |

### Reuse with adaptation

| Component | File | Adaptation needed |
|-----------|------|-------------------|
| `EventsGrid` pattern | `components/events/EventsGrid.jsx` | Clone as `VendorsGrid.jsx` — same skeleton + empty + grid pattern, swap `EventCard` for `VendorCard` |
| `ResultsMeta` pattern | `components/events/ResultsMeta.jsx` | Clone as `VendorsResultsMeta.jsx` — drop map/list toggle, keep count + filter chips |
| `FilterBar` pattern | `components/events/FilterBar.jsx` | New `VendorFilterBar.jsx` — different filter fields (cuisine, setup type, sort) but same visual structure |
| `EventsPage` pattern | `components/events/EventsPage.jsx` | Clone as `VendorsPage.jsx` — same filter/paginate/grid orchestration pattern |

### VendorCard adaptation

The existing `VendorCard.jsx` was built for the homepage top vendors section. The vendors page card is visually different:
- Full card layout (not compact avatar row)
- Avatar/emoji hero area with gradient background
- Tier badge (PRO / GROWTH) on avatar area
- Setup type badge
- Cuisine tag pills
- Rating stars + review count + events count + suburb
- "New on Pitch" badge for zero-rating DB vendors

**Decision:** Create a new `VendorBrowseCard.jsx` for the browse page. Keep existing `VendorCard.jsx` unchanged for homepage use.

---

## STEP 3 — Data Layer

### Existing functions in `lib/data/vendors.js`

| Function | Purpose | Reusable? |
|----------|---------|-----------|
| `fetchFeaturedVendors()` | Fetches `/api/featured-vendors` | No — different endpoint, homepage only |
| `mapVendorForCard()` | Maps DB vendor to card props | Partially — homepage card shape, needs extension |

### New functions needed

| Function | Endpoint | Returns | Notes |
|----------|----------|---------|-------|
| `fetchAllPublicVendors()` | `GET /api/vendors` | Mapped vendor array | Server-side fetch for page component. Returns `data.vendors` mapped through a new `mapVendorForBrowseCard()` |

### New mapper: `mapVendorForBrowseCard(vendor)`

Maps the `/api/vendors` response shape to the browse card props:

```
{
  id: vendor.user_id,
  name: vendor.trading_name,
  suburb: vendor.suburb || 'Adelaide',
  state: vendor.state || 'SA',
  bio: vendor.bio || '',
  cuisines: parseCuisineTags(vendor.cuisine_tags),
  setupType: vendor.setup_type || 'Market Stall',
  plan: vendor.plan || 'free',
  planLabel: PLAN_DISPLAY_LABELS[vendor.plan] || 'Starter',
  avatarUrl: vendor.avatar_url || null,
  rating: 0,        // Not in public API yet
  reviewCount: 0,   // Not in public API yet
  eventsCompleted: 0, // Not in public API yet
  isNew: true,      // All DB vendors are "new" until reviews exist
  tier: vendor.plan === 'growth' ? 0 : vendor.plan === 'pro' ? 1 : 2,
}
```

The static `data.js` merge is a legacy pattern. During migration, the browse page should show only real DB vendors. If the DB is empty, show an empty state. The static fallback can be dropped.

---

## STEP 4 — File Plan

### New files to create

| File | Lines (est.) | Purpose | Component type |
|------|-------------|---------|----------------|
| `app/vendors/page.jsx` | ~20 | Server component — fetches vendors, passes to client shell | Server |
| `components/vendors/VendorsPage.jsx` | ~150 | Client shell — filter state, pagination, grid orchestration | Client (`'use client'`) |
| `components/vendors/VendorsPage.module.css` | ~40 | Page layout styles (hero, wrapper) | CSS Module |
| `components/vendors/VendorFilterBar.jsx` | ~65 | Search, cuisine, setup type, sort dropdowns | Client (`'use client'`) |
| `components/vendors/VendorFilterBar.module.css` | ~120 | Filter bar styles | CSS Module |
| `components/vendors/VendorsGrid.jsx` | ~55 | Grid container with skeleton + empty state | Client (`'use client'`) |
| `components/vendors/VendorsGrid.module.css` | ~80 | Grid layout, skeleton, empty state styles | CSS Module |
| `components/vendors/VendorBrowseCard.jsx` | ~95 | Full vendor card for browse page | Client (`'use client'`) |
| `components/vendors/VendorBrowseCard.module.css` | ~150 | Card styles (avatar area, tier badge, tags, stats) | CSS Module |
| `components/vendors/VendorsResultsMeta.jsx` | ~40 | Result count + active filter chips | Client (`'use client'`) |
| `components/vendors/VendorsResultsMeta.module.css` | ~60 | Meta bar styles | CSS Module |

### Existing files to modify

| File | Changes |
|------|---------|
| `lib/data/vendors.js` | Add `fetchAllPublicVendors()` and `mapVendorForBrowseCard()` |
| `constants/ui.js` | Add `VENDOR_CUISINES`, `VENDOR_SETUP_TYPES`, `VENDOR_SORT_OPTIONS` |
| `constants/limits.js` | Add `VENDORS_PER_PAGE = 12` |
| `next.config.mjs` | Remove `/vendors` and `/vendors/:path*` rewrites from `afterFiles` |

---

## STEP 5 — Detailed File Specifications

### `app/vendors/page.jsx` (server component, ~20 lines)

```
Props: none
Data: calls fetchAllPublicVendors() at build/request time
Renders: <Suspense> wrapping <VendorsPage vendors={vendors} />
Exports: metadata (title, description matching current SEO)
Pattern: identical to app/events/page.jsx
```

### `components/vendors/VendorsPage.jsx` (client component, ~150 lines)

```
Props: { vendors: Vendor[] }
State: searchQuery, cuisineFilter, setupTypeFilter, sortOrder, currentPage
Renders: hero → VendorFilterBar → VendorsResultsMeta → VendorsGrid → Pagination
Pattern: mirrors components/events/EventsPage.jsx exactly
URL params: ?q=, ?cuisine=, ?setup=, ?sort= (synced via useSearchParams)

Filter logic:
  - Search: matches name OR any cuisine tag (case-insensitive)
  - Cuisine: exact match against cuisines array
  - Setup type: exact match
  - Sort: 'pro' (tier priority), 'az' (A-Z), 'za' (Z-A)

Default sort: tier priority (Growth → Pro → Starter, then A-Z within tier)
```

### `components/vendors/VendorFilterBar.jsx` (client component, ~65 lines)

```
Props: { filters, onFilterChange, onClearAll }
Renders: search input, cuisine select, setup type select, sort select, clear button
Constants: VENDOR_CUISINES, VENDOR_SETUP_TYPES, VENDOR_SORT_OPTIONS from constants/ui.js
Pattern: simplified version of events/FilterBar.jsx (no calendar/date range)
```

### `components/vendors/VendorsGrid.jsx` (client component, ~55 lines)

```
Props: { vendors: Vendor[], isLoading: boolean }
Renders:
  - Loading: 8 skeleton cards matching VendorBrowseCard shape
  - Empty: icon + "No vendors found" + "Try adjusting your filters"
  - Success: grid of VendorBrowseCard components
Grid: 3 columns desktop, 2 tablet, 1 mobile (matches current breakpoints)
Pattern: clone of events/EventsGrid.jsx with VendorBrowseCard swap
```

### `components/vendors/VendorBrowseCard.jsx` (client component, ~95 lines)

```
Props: { vendor }
Renders:
  - Top area: avatar/emoji with gradient background
  - Tier badge: GROWTH (ember) or PRO (gold) — Starter gets no badge
  - Setup type badge: bottom-left, colour-coded by type
  - Body: vendor name (Fraunces), cuisine tag pills, stats row
  - Stats row: star rating + review count | events count | suburb pin
  - "New on Pitch" badge for vendors with no reviews
Links to: /vendors/{vendor.id}
Pattern: matches current renderCard() output exactly
```

### `components/vendors/VendorsResultsMeta.jsx` (client component, ~40 lines)

```
Props: { filteredCount, totalCount, activeFilters, onRemoveFilter }
Renders: "X vendors found" + active filter chips with remove buttons
Pattern: simplified events/ResultsMeta.jsx (no map/list view toggle)
```

---

## STEP 6 — New Constants

### `constants/ui.js` additions

```javascript
// Cuisine filter options for vendor browse page.
// Matches the cuisine_tags values stored in the vendors table.
export const VENDOR_CUISINES = [
  { value: '', label: 'All Cuisines' },
  { value: 'BBQ', label: 'BBQ' },
  { value: 'Mexican', label: 'Mexican' },
  { value: 'Asian Fusion', label: 'Asian Fusion' },
  { value: 'Italian', label: 'Italian' },
  { value: 'Desserts', label: 'Desserts' },
  { value: 'Coffee & Drinks', label: 'Coffee & Drinks' },
  { value: 'Vegan', label: 'Vegan' },
  { value: 'Burgers', label: 'Burgers' },
  { value: 'Seafood', label: 'Seafood' },
  { value: 'Other', label: 'Other' },
]

// Setup type filter options for vendor browse page.
// Matches the setup_type values stored in the vendors table.
export const VENDOR_SETUP_TYPES = [
  { value: '', label: 'All Setup Types' },
  { value: 'Food Truck', label: 'Food Truck' },
  { value: 'Pop-up Stall', label: 'Pop-up Stall' },
  { value: 'Cart', label: 'Cart' },
]

// Sort options for vendor browse page.
// Default 'pro' sorts by subscription tier (Growth → Pro → Starter).
export const VENDOR_SORT_OPTIONS = [
  { value: 'pro', label: 'Sort: Featured' },
  { value: 'az', label: 'Sort: A\u2013Z' },
  { value: 'za', label: 'Sort: Z\u2013A' },
]
```

### `constants/limits.js` addition

```javascript
// Vendors shown per page on the /vendors browse page.
// 12 fills a 3x4 grid on desktop and scrolls naturally
// on mobile without requiring excessive pagination.
export const VENDORS_PER_PAGE = 12
```

---

## STEP 7 — next.config.mjs Changes

Remove these two rewrite rules from `afterFiles`:

```javascript
// REMOVE:
{ source: '/vendors', destination: `${expressBaseUrl}/vendors` },
{ source: '/vendors/:path*', destination: `${expressBaseUrl}/vendors/:path*` },
```

Keep `/vendors/:path*` rewrite for now since vendor detail pages (`/vendors/123`) are not part of this migration. Only remove the exact `/vendors` rewrite.

**Correction:** Actually, the `/vendors/:path*` rewrite catches `/vendors/123` (vendor detail pages) which are still served by Express. We need to keep that. So only remove:

```javascript
// REMOVE:
{ source: '/vendors', destination: `${expressBaseUrl}/vendors` },
// KEEP:
{ source: '/vendors/:path*', destination: `${expressBaseUrl}/vendors/:path*` },
```

---

## STEP 8 — Shared Component Reuse Summary

| Events page component | Vendors page equivalent | Reuse type |
|-----------------------|------------------------|------------|
| `EventsPage.jsx` | `VendorsPage.jsx` | Clone + adapt (different filters, same orchestration) |
| `FilterBar.jsx` | `VendorFilterBar.jsx` | New (simpler — no calendar, different fields) |
| `EventsGrid.jsx` | `VendorsGrid.jsx` | Clone + adapt (swap card component, same skeleton/empty pattern) |
| `ResultsMeta.jsx` | `VendorsResultsMeta.jsx` | Clone + simplify (drop view toggle) |
| `Pagination.jsx` | `Pagination.jsx` | **Direct reuse** (no changes) |
| `EventsPage.module.css` | `VendorsPage.module.css` | Clone + adapt (same layout tokens) |
| `EventCard.jsx` | `VendorBrowseCard.jsx` | New (different card design) |

**Pagination is the only component reused directly.** The others follow identical patterns but have different enough props/content that cloning and adapting is cleaner than parameterising.

---

## STEP 9 — Migration Order

Execute in this exact sequence:

1. **Constants** — Add `VENDOR_CUISINES`, `VENDOR_SETUP_TYPES`, `VENDOR_SORT_OPTIONS` to `constants/ui.js` and `VENDORS_PER_PAGE` to `constants/limits.js`
2. **Data layer** — Add `fetchAllPublicVendors()` and `mapVendorForBrowseCard()` to `lib/data/vendors.js`
3. **VendorBrowseCard** — Create `components/vendors/VendorBrowseCard.jsx` + `.module.css`
4. **VendorsGrid** — Create `components/vendors/VendorsGrid.jsx` + `.module.css`
5. **VendorFilterBar** — Create `components/vendors/VendorFilterBar.jsx` + `.module.css`
6. **VendorsResultsMeta** — Create `components/vendors/VendorsResultsMeta.jsx` + `.module.css`
7. **VendorsPage** — Create `components/vendors/VendorsPage.jsx` + `.module.css` (orchestrates all above)
8. **Page route** — Create `app/vendors/page.jsx` (server component)
9. **Rewrites** — Remove `/vendors` rewrite from `next.config.mjs`

---

## STEP 10 — Verification

1. `node serve.mjs` — start Express backend (provides `/api/vendors`)
2. `npm run dev` — start Next.js dev server
3. Visit `http://localhost:3001/vendors` (or whatever Next.js port)
4. **Check:** vendors load from API and display in grid
5. **Check:** skeleton shows during load
6. **Check:** empty state shows when no results match filters
7. **Check:** search filters by name and cuisine
8. **Check:** cuisine dropdown filters correctly
9. **Check:** setup type dropdown filters correctly
10. **Check:** sort options work (Featured/A-Z/Z-A)
11. **Check:** pagination works with 12 per page
12. **Check:** filter chips appear and are removable
13. **Check:** vendor cards link to `/vendors/{id}` (still served by Express)
14. **Check:** tier badges display for Pro/Growth vendors
15. **Check:** responsive grid: 3 cols desktop, 2 tablet, 1 mobile
16. **Check:** Navbar and Footer render correctly (shared components)
17. Screenshot and compare against current `pages/vendors.html` output

---

## Key Decisions

1. **Drop static data.js merge.** The current page merges DB vendors with static `data.js` fallback data. The migrated page will show only real DB vendors. If the DB is empty, show the empty state. This removes ~80 lines of merge logic and eliminates the dual data source complexity.

2. **New VendorBrowseCard, not reuse VendorCard.** The existing `VendorCard.jsx` is a compact row-style card for the homepage. The browse page card is a full card with avatar hero area, tier badges, and detailed stats. Different enough to warrant a separate component rather than overloading the existing one with conditional rendering.

3. **Drop suburb autocomplete filter.** The current page includes `pitchLocAC()` for suburb filtering via a hidden input. This is a minor feature that adds complexity (external script dependency). Can be added in a future iteration if needed.

4. **Server-side fetch, not client-side.** The current page fetches `/api/vendors` client-side. The migration moves this to a server component fetch (like `/events`), which means faster initial render, better SEO, and no FOUC.
