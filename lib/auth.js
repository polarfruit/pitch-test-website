import { config } from '@/lib/config'

export async function login(email, password) {
  const endpoint = `${config.apiBase}/api/login`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'Login failed. Please try again.',
      }
    }

    return { ok: true, redirect: data.redirect || '/' }
  } catch (error) {
    console.error('[login]', {
      message: error.message,
      endpoint,
      timestamp: new Date().toISOString(),
    })
    return {
      ok: false,
      error: 'Unable to reach the server. Check your connection and try again.',
    }
  }
}
