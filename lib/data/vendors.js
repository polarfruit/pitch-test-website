import { config } from '@/lib/config'

const PLAN_DISPLAY_LABELS = { free: 'Starter', pro: 'Pro', growth: 'Growth' }

const VENDOR_AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #E8500A 0%, #C9840A 100%)',
  'linear-gradient(135deg, #2D8B55 0%, #1A6B3C 100%)',
  'linear-gradient(135deg, #2B5BA8 0%, #1A3D7A 100%)',
  'linear-gradient(135deg, #C9840A 0%, #E8500A 100%)',
  'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
  'linear-gradient(135deg, #C0392B 0%, #962D22 100%)',
]

function generateAvatarGradient(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return VENDOR_AVATAR_GRADIENTS[Math.abs(hash) % VENDOR_AVATAR_GRADIENTS.length]
}

function parseCuisineTags(cuisineTagsValue) {
  if (Array.isArray(cuisineTagsValue)) return cuisineTagsValue
  if (typeof cuisineTagsValue === 'string') {
    try { return JSON.parse(cuisineTagsValue) } catch { return [] }
  }
  return []
}

function mapVendorForCard(vendor) {
  const tradingName = vendor.trading_name ?? vendor.name ?? ''
  return {
    ...vendor,
    slug: vendor.slug ?? vendor.user_id,
    name: tradingName,
    subtitle: vendor.setup_type ?? vendor.subtitle ?? '',
    tags: parseCuisineTags(vendor.cuisine_tags ?? vendor.tags),
    plan: vendor.plan ?? 'free',
    planLabel: PLAN_DISPLAY_LABELS[vendor.plan] ?? vendor.planLabel ?? 'Starter',
    rating: vendor.rating ?? null,
    reviewCount: vendor.reviewCount ?? vendor.review_count ?? 0,
    eventsCompleted: vendor.eventsCompleted ?? vendor.events_completed ?? 0,
    verified: vendor.verified ?? (vendor.featured === 1),
    emoji: vendor.emoji ?? '🍽',
    avatarGradient: vendor.avatarGradient ?? generateAvatarGradient(tradingName),
  }
}

export async function fetchFeaturedVendors() {
  try {
    const response = await fetch(
      `${config.apiBase}/api/featured-vendors`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(
        `[fetchFeaturedVendors] Request failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    return Array.isArray(data) ? data.map(mapVendorForCard) : []
  } catch (error) {
    console.error('[fetchFeaturedVendors]', {
      message: error.message,
      endpoint: `${config.apiBase}/api/featured-vendors`,
      timestamp: new Date().toISOString(),
    })

    return []
  }
}
