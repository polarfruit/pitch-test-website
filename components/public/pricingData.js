export const PRICING_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For vendors just getting started',
    price: 'Free',
    isFree: true,
    billingNote: 'Forever — no credit card needed',
    desc: 'Everything you need to get on the map. Apply to events, build your profile, and start collecting reviews.',
    ctaLabel: 'Get started free',
    ctaHref: '/signup/vendor',
    ctaVariant: 'secondary',
    features: [
      'Full vendor profile with photos & menu',
      'Up to 10 event applications per month',
      'Up to 4 photos on your profile',
      'Message organisers you\'ve applied to',
      'Standard placement in search',
      'Calendar view of your events',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For vendors serious about growth',
    price: '$29',
    period: '/month',
    billingNote: 'Billed monthly · cancel anytime',
    desc: 'Priority placement, early event access, and analytics that show what\'s working — and what isn\'t.',
    ctaLabel: 'Join free during founding phase →',
    ctaHref: '/signup/vendor?plan=pro',
    ctaVariant: 'primary',
    featured: true,
    badge: 'Most popular',
    foundingLabel: 'Currently free — founding phase',
    features: [
      'Everything in Starter',
      'Priority placement in organiser search',
      'Pro badge on your profile',
      'Up to 10 photos on your profile',
      'New event alerts within 2 hours',
      'Late application window (12 hrs)',
      'Application templates',
      'Profile view analytics (30-day)',
      'iCal export',
      'Document expiry reminders',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For vendors ready to dominate',
    price: '$79',
    period: '/month',
    billingNote: 'Billed monthly · cancel anytime',
    desc: 'Top placement, 24-hour early event access, competitor insights, and team access — for vendors who treat this as a business.',
    ctaLabel: 'Join free during founding phase →',
    ctaHref: '/signup/vendor?plan=growth',
    ctaVariant: 'secondary',
    growthCard: true,
    foundingLabel: 'Currently free — founding phase',
    features: [
      'Everything in Pro',
      'Top placement in organiser search',
      'Growth badge on your profile',
      'Up to 20 photos in named galleries',
      '24-hour early event access',
      'Late application window (48 hrs)',
      'Cold-contact any organiser on Pitch',
      'Signature showcase item on profile',
      'Custom vanity URL',
      'Competitor count insights',
      'Shortlist tracking ("Close calls")',
      'Bookkeeping summary export',
      'Second account user (team access)',
    ],
  },
]

const YES = { type: 'yes' }
const NO = { type: 'no' }
const text = value => ({ type: 'text', value })

export const COMPARE_SECTIONS = [
  {
    label: 'Applications',
    rows: [
      { feature: 'Applications per month', starter: text('10 per month'), pro: text('Unlimited'), growth: text('Unlimited') },
      { feature: 'Late application window after deadline', starter: NO, pro: text('12 hours'), growth: text('48 hours') },
      { feature: 'Waitlist position', starter: text('Standard'), pro: text('Elevated'), growth: text('Top of list') },
      { feature: 'Withdraw & reapply', starter: NO, pro: text('Up to 2 times'), growth: text('Unlimited') },
      { feature: 'Application note templates', starter: NO, pro: YES, growth: YES },
    ],
  },
  {
    label: 'Messaging',
    rows: [
      { feature: 'Message organisers you\'ve applied to', starter: YES, pro: YES, growth: YES },
      { feature: 'Message organisers from past applications', starter: NO, pro: YES, growth: YES },
      { feature: 'Cold-contact any organiser on Pitch', starter: NO, pro: NO, growth: YES },
    ],
  },
  {
    label: 'Profile visibility',
    rows: [
      { feature: 'Default search placement', starter: text('Standard'), pro: text('Priority'), growth: text('Top placement') },
      { feature: 'Tier badge on profile & search cards', starter: NO, pro: text('Pro badge'), growth: text('Growth badge') },
      { feature: 'Custom vanity URL', starter: NO, pro: NO, growth: YES },
      { feature: 'Signature showcase item on profile', starter: NO, pro: NO, growth: YES },
    ],
  },
  {
    label: 'Profile content',
    rows: [
      { feature: 'Photo uploads', starter: text('Up to 4'), pro: text('Up to 10'), growth: text('Up to 20') },
      { feature: 'Named photo galleries', starter: NO, pro: NO, growth: YES },
      { feature: 'Full menu editor (unlimited items)', starter: YES, pro: YES, growth: YES },
      { feature: 'Second account user (team access)', starter: NO, pro: NO, growth: YES },
    ],
  },
  {
    label: 'Discovery & notifications',
    rows: [
      { feature: 'New event alerts', starter: NO, pro: text('Within 2 hours'), growth: text('24-hr early access') },
      { feature: 'Early event access window', starter: NO, pro: NO, growth: text('24 hours before others') },
      { feature: 'Organiser invitation priority', starter: text('Standard'), pro: text('After Growth window'), growth: text('Instant (48-hr head start)') },
      { feature: 'Shortlist notifications', starter: NO, pro: NO, growth: YES },
      { feature: 'Document expiry reminders', starter: NO, pro: YES, growth: YES },
    ],
  },
  {
    label: 'Analytics',
    rows: [
      { feature: 'Profile view tracking', starter: NO, pro: text('30-day total'), growth: text('Trend + source breakdown') },
      { feature: 'Application acceptance rate', starter: NO, pro: text('Overall %'), growth: text('Full breakdown by type') },
      { feature: 'Application count on event cards', starter: NO, pro: text('Total count'), growth: text('+ Cuisine breakdown') },
      { feature: 'Competitor count insights', starter: NO, pro: NO, growth: YES },
      { feature: 'Shortlist tracking ("Close calls")', starter: NO, pro: NO, growth: YES },
      { feature: 'iCal calendar export', starter: NO, pro: YES, growth: YES },
    ],
  },
  {
    label: 'Operations & admin',
    rows: [
      { feature: 'Download payment history PDF', starter: NO, pro: YES, growth: YES },
      { feature: 'Bookkeeping summary export', starter: NO, pro: NO, growth: YES },
      { feature: '14-day free trial', starter: NO, pro: YES, growth: YES },
    ],
  },
]

export const PRICING_FAQ = [
  { q: 'Can I cancel or change my plan at any time?', a: 'Yes — you can upgrade, downgrade, or cancel your subscription at any time from your account settings. If you cancel or downgrade, you keep your current plan\'s features until the end of your billing cycle. No cancellation fees, no lock-in periods.' },
  { q: 'Does the Starter plan require a credit card?', a: 'No. The Starter plan is completely free — no credit card required. You can create a profile and apply to up to 10 events per month at no cost.' },
  { q: 'What happens to my photos and data if I downgrade?', a: 'Nothing is deleted. If you downgrade and have more photos than your new plan allows, the most recently uploaded photos are hidden from your public profile — but they are safely stored and will reappear immediately if you upgrade again. All your application history, payment records, and documents are preserved regardless of plan.' },
  { q: 'Can a Starter vendor apply to every event?', a: 'Yes — Starter vendors can apply to any open event with no limit on the number of applications. What Starter vendors don\'t get is early event access, late application windows after the deadline, or the ability to reapply after withdrawing. But if the event is open and you\'re in time, you can always apply.' },
  { q: 'How does the 24-hour early access work for Growth vendors?', a: 'When an organiser posts a new event, Growth vendors are notified immediately and can apply for the first 24 hours exclusively. Pro vendors are notified within 2 hours of that 24-hour window closing. Starter vendors see the event when it appears in the general listing. This gives Growth vendors a genuine head start on competitive events with limited spots.' },
  { q: 'Can I trial both Pro and Growth before committing?', a: 'You can trial each plan once. If you\'ve previously trialled Pro, you can still start a fresh 14-day Growth trial. Once you\'ve completed a trial for a plan, you\'d need to subscribe to use it again — the trial is a one-time offer per plan. This is enforced at the account level, not per device.' },
]
