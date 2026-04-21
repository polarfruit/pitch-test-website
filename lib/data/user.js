import { cookies } from 'next/headers'
import { config } from '@/lib/config'

export async function fetchCurrentUser() {
  const endpoint = `${config.apiBase}/api/me`
  try {
    const cookieStore = await cookies()
    const cookieHeader = cookieStore
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ')

    const response = await fetch(endpoint, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `[fetchCurrentUser] Request failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    return data.user ?? null
  } catch (error) {
    console.error('[fetchCurrentUser]', {
      message: error.message,
      endpoint,
      timestamp: new Date().toISOString(),
    })

    return null
  }
}
