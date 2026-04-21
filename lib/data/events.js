import { config } from '@/lib/config'
import { formatEventDate, formatDeadlineDate } from '@/lib/utils/eventFormatters'

function mapEventForCard(event) {
  return {
    ...event,
    date: event.date_sort ?? event.date,
    dateEnd: event.date_end ?? event.dateEnd,
    photo: event.cover_image ?? event.photo,
    feeMin: event.stall_fee_min ?? event.feeMin,
    feeMax: event.stall_fee_max ?? event.feeMax,
    fee_min: event.stall_fee_min ?? event.fee_min,
    fee_max: event.stall_fee_max ?? event.fee_max,
    deadlineLabel: formatDeadlineDate(event.deadline),
    dateLabel: formatEventDate(event.date_text ?? event.date_sort) || event.dateLabel,
    total: event.stalls_available ?? event.total ?? event.spots_total,
    filled: event.vendor_count ?? event.filled ?? 0,
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

export async function fetchAllPublishedEvents() {
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
        `[fetchAllPublishedEvents] Request failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    const events = data.events ?? []
    return events.map(mapEventForCard)
  } catch (error) {
    console.error('[fetchAllPublishedEvents]', {
      message: error.message,
      endpoint: `${config.apiBase}/api/events`,
      timestamp: new Date().toISOString(),
    })

    return []
  }
}

export async function fetchEventBySlug(slug) {
  const endpoint = `${config.apiBase}/api/events/${encodeURIComponent(slug)}`
  try {
    const response = await fetch(endpoint, { cache: 'no-store' })

    if (response.status === 404) return null

    if (!response.ok) {
      throw new Error(
        `[fetchEventBySlug] Request failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    return data.event ?? null
  } catch (error) {
    console.error('[fetchEventBySlug]', {
      message: error.message,
      slug,
      endpoint,
      timestamp: new Date().toISOString(),
    })

    return null
  }
}

export async function fetchSimilarEvents({ excludeId, category, limit = 3 }) {
  try {
    const allEvents = await fetchAllPublishedEvents()
    const today = new Date().toISOString().slice(0, 10)

    return allEvents
      .filter(event => event.id !== excludeId)
      .filter(event => !category || event.category === category)
      .filter(event => (event.date_sort ?? event.date ?? '9999') >= today)
      .slice(0, limit)
  } catch (error) {
    console.error('[fetchSimilarEvents]', {
      message: error.message,
      excludeId,
      category,
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
