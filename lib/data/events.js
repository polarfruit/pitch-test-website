import { config } from '@/lib/config'

function mapEventForCard(event) {
  return {
    ...event,
    feeMin: event.stall_fee_min ?? event.feeMin,
    feeMax: event.stall_fee_max ?? event.feeMax,
    deadlineLabel: event.deadline ?? event.deadlineLabel,
    dateLabel: event.date_text ?? event.date_sort ?? event.dateLabel,
    total: event.stalls_available ?? event.total ?? event.spots_total,
  }
}

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

    const data = await response.json()
    return Array.isArray(data) ? data.map(mapEventForCard) : []
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
    const events = data.events ?? []
    return events.map(mapEventForCard)
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
