// ── Brand colours ─────────────────────────────────────
export const COLOR_EMBER = '#E8500A'
export const COLOR_EMBER_GLOW = '#FF6B2B'
export const COLOR_COAL = '#1A1612'
export const COLOR_CHAR = '#231E19'
export const COLOR_PARCHMENT = '#FDF4E7'
export const COLOR_CREAM = '#F5EDD8'
export const COLOR_LINEN = '#EDE3CC'

// ── Semantic colours ──────────────────────────────────
export const COLOR_SUCCESS = '#2D8B55'
export const COLOR_WARNING = '#C9840A'
export const COLOR_ERROR = '#C0392B'
export const COLOR_INFO = '#2B5BA8'

// ── Text colours ──────────────────────────────────────
export const COLOR_TEXT_HI = '#FDF4E7'
export const COLOR_TEXT_MID = '#A89880'
export const COLOR_TEXT_LO = '#6B5A4A'

// ── Typography ────────────────────────────────────────
export const FONT_DISPLAY = 'Fraunces'
export const FONT_BODY = 'Instrument Sans'

// Tight tracking on large display headings prevents
// wide Fraunces letterforms from looking loose at
// sizes above 32px.
export const HEADING_LETTER_SPACING = '-0.03em'

// Generous line-height on body text improves
// readability for longer content blocks.
export const BODY_LINE_HEIGHT = '1.7'

// ── Navbar ───────────────────────────────────────────
// Scroll distance before the navbar switches from
// transparent to solid background. 10px avoids
// flickering on sub-pixel scroll bounces.
export const NAVBAR_SCROLL_THRESHOLD_PX = 10

// ── Contact & social ─────────────────────────────────
export const CONTACT_EMAIL = 'hello@onpitch.com.au'

export const SOCIAL_LINKS = {
  INSTAGRAM: 'https://instagram.com/pitchmkts',
  X: 'https://x.com/pitchmkts',
  FACEBOOK: 'https://facebook.com/pitchmkts',
  LINKEDIN: 'https://linkedin.com/company/pitchmkts',
}

export const COPYRIGHT_YEAR = new Date().getFullYear()

// ── Category badges ──────────────────────────────────
// Colours map to CSS custom properties defined in
// globals.css. Each category gets a distinct tint
// so organisers can scan event types at a glance.
export const CATEGORY_BADGE_COLORS = {
  'Night Market': {
    background: 'var(--slate-bg)',
    color: 'var(--slate)',
  },
  'Farmers Market': {
    background: 'var(--herb-bg)',
    color: 'var(--herb-dark)',
  },
  'Festival': {
    background: 'var(--purple-bg)',
    color: 'var(--purple)',
  },
  'Twilight Market': {
    background: 'var(--gold-bg)',
    color: 'var(--gold-dark)',
  },
  'Pop-up': {
    background: 'var(--ember-badge-bg)',
    color: 'var(--ember-dark)',
  },
  'Corporate': {
    background: 'var(--slate-bg)',
    color: 'var(--slate)',
  },
}
