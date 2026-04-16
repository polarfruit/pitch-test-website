const API_BASE = process.env.EXPRESS_URL || 'http://localhost:3000'

export async function getPlatformStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
