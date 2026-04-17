import { config } from '@/lib/config'

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

    return await response.json()
  } catch (error) {
    console.error('[fetchFeaturedVendors]', {
      message: error.message,
      endpoint: `${config.apiBase}/api/featured-vendors`,
      timestamp: new Date().toISOString(),
    })

    return []
  }
}
