/**
 * helpers.mjs — Pure utility functions for email templates.
 *
 * No framework imports. No side effects. Every function is a
 * pure transformation: input in, value out, nothing else.
 */

// ── Date formatting ─────────────────────────────────────────────────────────

/**
 * Converts a Unix timestamp (seconds or milliseconds) or ISO string
 * to "19 April 2026" format (en-AU locale).
 */
export function formatDate(timestamp) {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp > 1e12 ? timestamp : timestamp * 1000)
    : new Date(timestamp);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Currency formatting ─────────────────────────────────────────────────────

/** Returns "$29.00" format from a dollar amount. */
export function formatCurrency(amountInDollars) {
  return `$${Number(amountInDollars).toFixed(2)}`;
}

// ── Plan feature lists ──────────────────────────────────────────────────────

const PRO_FEATURES = [
  'Unlimited applications',
  'Priority placement in search',
  'Pro badge on your profile',
  'Up to 10 profile photos',
  'New event alerts within 2 hours',
  'Application templates',
  'Profile view analytics',
  'iCal calendar export',
  'Document expiry reminders',
];

const GROWTH_ONLY_FEATURES = [
  'Top placement in search',
  'Growth badge on profile',
  'Up to 20 photos in named galleries',
  '24-hour early event access',
  'Cold contact any organiser',
  'Custom vanity URL',
  'Bookkeeping summary export',
  'Team access (second user)',
];

/**
 * Returns the feature list for a given plan.
 * Growth includes all Pro features plus Growth-only capabilities.
 * Starter returns an empty array.
 */
export function getPlanFeatures(plan) {
  if (plan === 'growth') return [...PRO_FEATURES, ...GROWTH_ONLY_FEATURES];
  if (plan === 'pro') return PRO_FEATURES;
  return [];
}

/** Returns the human-readable label for a plan slug. */
export function getPlanLabel(plan) {
  if (plan === 'pro') return 'Pro';
  if (plan === 'growth') return 'Growth';
  return 'Starter';
}
