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
    verified: vendor.verified ?? (vendor.abn_verified === 1),
    emoji: vendor.emoji ?? '🍽',
    avatarGradient: vendor.avatarGradient ?? generateAvatarGradient(tradingName),
  }
}

function parsePhotoList(photosValue) {
  if (Array.isArray(photosValue)) return photosValue
  if (typeof photosValue === 'string') {
    try {
      const parsed = JSON.parse(photosValue)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function mapVendorForDetail(vendor) {
  const cardShape = mapVendorForCard(vendor)
  const firstName = vendor.first_name ?? ''
  const lastName = vendor.last_name ?? ''
  const ownerName = `${firstName} ${lastName}`.trim()
  return {
    ...cardShape,
    userId: vendor.user_id,
    tradingName: cardShape.name,
    ownerName,
    avatarUrl: vendor.avatar_url ?? null,
    bio: vendor.bio ?? '',
    setupType: vendor.setup_type ?? '',
    photos: parsePhotoList(vendor.photos),
    stallDimensions: vendor.stall_dimensions ?? '',
    powerAvailable: vendor.power_available ?? null,
    waterAvailable: vendor.water_available ?? null,
    abn: vendor.abn ?? '',
    instagramHandle: vendor.instagram_handle ?? '',
    websiteUrl: vendor.website_url ?? '',
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

export async function fetchAllPublishedVendors() {
  try {
    const response = await fetch(
      `${config.apiBase}/api/vendors`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(
        `[fetchAllPublishedVendors] Request failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    const vendors = Array.isArray(data?.vendors) ? data.vendors : []
    return vendors.map(mapVendorForCard)
  } catch (error) {
    console.error('[fetchAllPublishedVendors]', {
      message: error.message,
      endpoint: `${config.apiBase}/api/vendors`,
      timestamp: new Date().toISOString(),
    })

    return []
  }
}

export async function fetchVendorById(vendorUserId) {
  const endpoint = `${config.apiBase}/api/vendors/${vendorUserId}`
  try {
    const response = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })

    if (response.status === 404) return null

    if (!response.ok) {
      throw new Error(
        `[fetchVendorById] Request failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    return data?.vendor ? mapVendorForDetail(data.vendor) : null
  } catch (error) {
    console.error('[fetchVendorById]', {
      message: error.message,
      endpoint,
      timestamp: new Date().toISOString(),
    })
    return null
  }
}

export async function fetchVendorMenu(vendorUserId) {
  const endpoint = `${config.apiBase}/api/vendors/${vendorUserId}/menu`
  try {
    const response = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `[fetchVendorMenu] Request failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.error('[fetchVendorMenu]', {
      message: error.message,
      endpoint,
      timestamp: new Date().toISOString(),
    })
    return []
  }
}
