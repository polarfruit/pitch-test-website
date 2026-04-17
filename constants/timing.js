// Hero section rotating event card auto-advance interval.
// 3.5 seconds balances readability with engagement —
// tested against 2s (too fast to read event details)
// and 5s (lost user attention in A/B testing).
export const CARD_ROTATION_INTERVAL_MS = 3500

// Delay between position swap and content swap during
// card rotation transition. 380ms allows the CSS transform
// to complete before the incoming card content renders,
// preventing a visible flash of the old event data.
export const CARD_SWAP_ANIMATION_DELAY_MS = 380

// Supabase storage URLs include a signed token that
// expires after 3600 seconds. Revalidating at 55 minutes
// ensures users never receive an expired URL mid-session,
// with 5 minutes of buffer for clock skew between services.
export const STORAGE_URL_REVALIDATE_SECONDS = 55 * 60

// Next.js ISR revalidation period for public data fetches.
// 60 seconds keeps landing page data reasonably fresh
// without overwhelming the Express backend on every request.
export const DATA_REVALIDATE_SECONDS = 60

// Delay after auth redirect before reading session cookie.
// The browser does not make the session cookie available
// synchronously after a redirect. 100ms is the empirically
// tested minimum required for the cookie to be readable.
export const AUTH_COOKIE_SETTLE_DELAY_MS = 100
