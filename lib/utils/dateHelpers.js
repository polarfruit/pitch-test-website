/**
 * Converts a "when" URL search parameter into a concrete date range.
 *
 * Used by the events page to translate shorthand filter values
 * (e.g. ?when=weekend) into dateFrom/dateTo ISO date strings
 * that the event filter logic can compare against.
 *
 * @param {string} whenValue — One of 'weekend', 'month', or 'next'.
 * @returns {{ dateFrom: string, dateTo: string }} ISO date strings
 *   (YYYY-MM-DD). Both empty strings if whenValue is unrecognised.
 */
export function computeDateRangeFromWhenParam(whenValue) {
  const today = new Date()
  const toIso = (date) => date.toISOString().split('T')[0]

  if (whenValue === 'weekend') {
    const dayOfWeek = today.getDay()
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7
    const friday = new Date(today)
    friday.setDate(today.getDate() + daysUntilFriday)
    const sunday = new Date(friday)
    sunday.setDate(friday.getDate() + 2)
    return { dateFrom: toIso(friday), dateTo: toIso(sunday) }
  }

  if (whenValue === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { dateFrom: toIso(monthStart), dateTo: toIso(monthEnd) }
  }

  if (whenValue === 'next') {
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0)
    return { dateFrom: toIso(nextMonthStart), dateTo: toIso(nextMonthEnd) }
  }

  return { dateFrom: '', dateTo: '' }
}
