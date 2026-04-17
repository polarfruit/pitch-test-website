import { config } from '@/lib/config'

export async function fetchPlatformStats() {
  try {
    const response = await fetch(
      `${config.apiBase}/api/stats`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(
        `[fetchPlatformStats] Request failed: ${response.status} ${response.statusText}`
      )
    }

    return await response.json()
  } catch (error) {
    console.error('[fetchPlatformStats]', {
      message: error.message,
      endpoint: `${config.apiBase}/api/stats`,
      timestamp: new Date().toISOString(),
    })

    return null
  }
}
