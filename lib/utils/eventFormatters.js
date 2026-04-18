/**
 * Shared date formatting for event cards.
 *
 * Used by the server-side data layer (mapEventForCard) and by
 * HeroSection's CardStack so both consume the same logic.
 */

export function formatEventDate(dateString) {
  if (!dateString) return ''
  const parsedDate = new Date(dateString + 'T00:00:00')
  return parsedDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDeadlineDate(dateString) {
  if (!dateString) return '\u2014'
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function formatBoothFeeRange(minimumFee, maximumFee) {
  if (minimumFee && maximumFee) return `$${minimumFee}\u2013$${maximumFee}`
  if (minimumFee) return `$${minimumFee}+`
  return '\u2014'
}
