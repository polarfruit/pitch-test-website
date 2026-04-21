'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { login } from '@/lib/auth'
import { ROUTES } from '@/constants/routes'
import FormInput from './FormInput'
import SubmitButton from './SubmitButton'
import ErrorMessage from './ErrorMessage'
import styles from './LoginForm.module.css'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submissionError, setSubmissionError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleFormSubmit(event) {
    event.preventDefault()
    if (isSubmitting) return

    setSubmissionError('')
    setIsSubmitting(true)

    const result = await login(email, password)

    if (result.ok) {
      router.push(result.redirect)
      return
    }

    setSubmissionError(result.error)
    setIsSubmitting(false)
  }

  return (
    <>
      <h1 className={styles.heading}>Welcome back</h1>
      <p className={styles.subtitle}>Sign in to your Pitch. account.</p>

      <form className={styles.form} onSubmit={handleFormSubmit} noValidate>
        <ErrorMessage message={submissionError} />

        <FormInput
          label="Email address"
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
          disabled={isSubmitting}
        />

        <FormInput
          label="Password"
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
          autoComplete="current-password"
          required
          disabled={isSubmitting}
        />

        <Link href={ROUTES.FORGOT_PASSWORD} className={styles.forgotLink}>
          Forgot password?
        </Link>

        <SubmitButton label="Sign in" isLoading={isSubmitting} />
      </form>

      <p className={styles.footer}>
        New to Pitch.?{' '}
        <Link href={ROUTES.SIGNUP} className={styles.signupLink}>
          Create an account
        </Link>
      </p>
    </>
  )
}
