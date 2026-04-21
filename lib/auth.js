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

export async function sendPresignupCode(email) {
  const endpoint = `${config.apiBase}/api/presignup/send-code`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'Could not send verification code. Please try again.',
      }
    }

    return { ok: true, devCode: data.devCode || null }
  } catch (error) {
    console.error('[sendPresignupCode]', {
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

export async function verifyPresignupCode(email, code) {
  const endpoint = `${config.apiBase}/api/presignup/verify-code`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, code }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'That code did not match. Please try again.',
      }
    }

    return { ok: true }
  } catch (error) {
    console.error('[verifyPresignupCode]', {
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

export async function signupVendor(payload) {
  const endpoint = `${config.apiBase}/api/signup/vendor`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'Could not create your vendor account. Please try again.',
      }
    }

    return { ok: true, redirect: data.redirect || '/dashboard/vendor' }
  } catch (error) {
    console.error('[signupVendor]', {
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

export async function signupOrganiser(payload) {
  const endpoint = `${config.apiBase}/api/signup/organiser`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'Could not create your organiser account. Please try again.',
      }
    }

    return { ok: true, redirect: data.redirect || '/dashboard/organiser' }
  } catch (error) {
    console.error('[signupOrganiser]', {
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

export async function forgotPassword(email) {
  const endpoint = `${config.apiBase}/api/forgot-password`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'Could not send reset link. Please try again.',
      }
    }

    return { ok: true }
  } catch (error) {
    console.error('[forgotPassword]', {
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

export async function resetPassword(token, password) {
  const endpoint = `${config.apiBase}/api/reset-password`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'This reset link has expired or already been used.',
      }
    }

    return { ok: true }
  } catch (error) {
    console.error('[resetPassword]', {
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

export async function verifyEmailCode(code) {
  const endpoint = `${config.apiBase}/api/verify/email`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'That code did not match. Please try again.',
      }
    }

    return { ok: true, redirect: data.redirect || '/verify/phone' }
  } catch (error) {
    console.error('[verifyEmailCode]', {
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

export async function resendEmailCode() {
  const endpoint = `${config.apiBase}/api/verify/email/resend`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'Could not resend the code. Please try again.',
      }
    }

    return { ok: true }
  } catch (error) {
    console.error('[resendEmailCode]', {
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

export async function verifyABN(abn, context) {
  const endpoint = `${config.apiBase}/api/verify-abn`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ abn, context }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || 'Could not verify this ABN. Please try again.',
      }
    }

    return {
      ok: true,
      valid: Boolean(data.valid),
      entityName: data.entityName || '',
      error: data.valid ? '' : (data.error || ''),
    }
  } catch (error) {
    console.error('[verifyABN]', {
      message: error.message,
      endpoint,
      timestamp: new Date().toISOString(),
    })
    return {
      ok: false,
      error: 'Unable to reach the ABN service. Check your connection and try again.',
    }
  }
}
