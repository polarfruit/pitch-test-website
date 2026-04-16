const API_BASE = process.env.EXPRESS_URL || 'http://localhost:3000'

export async function getFeaturedEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/featured-events`, { next: { revalidate: 60 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.events || data || []
  } catch {
    return []
  }
}

export async function getThisWeekendEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events?weekend=true`, { next: { revalidate: 60 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.events || data || []
  } catch {
    return []
  }
}

export async function getCategoryCounts() {
  try {
    const res = await fetch(`${API_BASE}/api/category-counts`, { next: { revalidate: 60 } })
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}
