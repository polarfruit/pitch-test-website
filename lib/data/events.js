import { config } from '@/lib/config'

export async function fetchFeaturedEvents() {
  try {
    const response = await fetch(
      `${config.apiBase}/api/featured-events`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(
        `[fetchFeaturedEvents] Request failed: ${response.status} ${response.statusText}`
      )
    }

    return await response.json()
  } catch (error) {
    console.error('[fetchFeaturedEvents]', {
      message: error.message,
      endpoint: `${config.apiBase}/api/featured-events`,
      timestamp: new Date().toISOString(),
    })

    return []
  }
}

export async function fetchThisWeekendEvents() {
  try {
    const response = await fetch(
      `${config.apiBase}/api/events`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(
        `[fetchThisWeekendEvents] Request failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    return data.events ?? []
  } catch (error) {
    console.error('[fetchThisWeekendEvents]', {
      message: error.message,
      endpoint: `${config.apiBase}/api/events`,
      timestamp: new Date().toISOString(),
    })

    return []
  }
}

export async function fetchCategoryCounts() {
  try {
    const response = await fetch(
      `${config.apiBase}/api/category-counts`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(
        `[fetchCategoryCounts] Request failed: ${response.status} ${response.statusText}`
      )
    }

    return await response.json()
  } catch (error) {
    console.error('[fetchCategoryCounts]', {
      message: error.message,
      endpoint: `${config.apiBase}/api/category-counts`,
      timestamp: new Date().toISOString(),
    })

    return {}
  }
}
