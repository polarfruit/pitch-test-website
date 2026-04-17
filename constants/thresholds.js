// 60 days chosen based on the SA Food Safety
// certificate renewal process. Vendors need
// a minimum of 8 weeks notice to renew without
// disrupting their active trading schedule.
export const DOCUMENT_EXPIRY_WARNING_DAYS = 60

// 70% threshold not 75% — organiser research
// showed vendor application rates drop sharply
// when fill rate displays above 75%. The 70%
// threshold creates urgency without deterring
// otherwise-qualified applicants.
export const FILL_RATE_WARNING_THRESHOLD = 0.70

// Minimum rating (out of 5) for a vendor to
// appear in the "featured vendors" carousel on
// the landing page. Set at 4.0 to maintain
// quality perception for new visitors.
export const FEATURED_VENDOR_MIN_RATING = 4.0

// 90% fill rate triggers "almost full" visual treatment
// and disables the apply button on the event card.
// Prevents last-minute surge applications that organisers
// cannot process before the event date.
export const FILL_RATE_CRITICAL_THRESHOLD = 0.90
