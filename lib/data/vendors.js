const API_BASE = process.env.EXPRESS_URL || 'http://localhost:3000'

export async function getFeaturedVendors() {
  try {
    const res = await fetch(`${API_BASE}/api/featured-vendors`, { next: { revalidate: 60 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.vendors || data || []
  } catch {
    return []
  }
}
