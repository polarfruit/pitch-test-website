// Maximum file size for vendor profile photo uploads.
// 5MB balances image quality with upload speed on
// Australian regional mobile connections.
export const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024

// Maximum number of photos in a vendor gallery.
// 12 keeps the gallery focused without overwhelming
// organisers reviewing vendor applications.
export const MAX_VENDOR_GALLERY_PHOTOS = 12

// Maximum number of menu items a vendor can create.
// Keeps menus scannable for organisers evaluating
// vendor fit for their event.
export const MAX_VENDOR_MENU_ITEMS = 50

// Maximum file size for document uploads (PLI, food safety).
// 10MB accommodates high-resolution scanned certificates.
export const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024

// Star rating scale used across vendor reviews and
// organiser ratings. Anchored at 5 to match Google
// and industry-standard review systems.
export const MAX_STAR_RATING = 5

// Maximum events loaded into hero card rotation pool
// including static fallbacks. 6 gives enough variety
// in the rotation without overloading the card stack.
export const MAX_HERO_CARD_POOL_SIZE = 6

// Number of cards visible in hero stack at any one time.
// 3 creates the layered depth effect (front, middle, back)
// that makes the rotation visually engaging.
export const VISIBLE_CARD_COUNT = 3

// Maximum events shown in EventsNearYou section on
// homepage. 6 fills two rows of three on desktop and
// scrolls naturally on mobile without overwhelming.
export const MAXIMUM_DISPLAYED_EVENTS = 6

// Events shown per page on the /events browse page.
// 12 fills a 4x3 grid on desktop and scrolls naturally
// on mobile without requiring excessive pagination.
export const EVENTS_PER_PAGE = 12
