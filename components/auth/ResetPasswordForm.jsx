'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resetPassword } from '@/lib/auth'
import { ROUTES } from '@/constants/routes'
import FormInput from './FormInput'
import SubmitButton from './SubmitButton'
import ErrorMessage from './ErrorMessage'
import styles from './ResetPasswordForm.module.css'

const MIN_PASSWORD_LENGTH = 8
const SUCCESS_REDIRECT_DELAY_MS = 2000

export default function ResetPasswordForm({ token }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submissionError, setSubmissionError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSucceeded, setIsSucceeded] = useState(false)

  useEffect(() => {
    if (!isSucceeded) return
    const timeout = setTimeout(() => router.push(ROUTES.LOGIN), SUCCESS_REDIRECT_DELAY_MS)
    return () => clearTimeout(timeout)
  }, [isSucceeded, router])

  async function handleFormSubmit(event) {
    event.preventDefault()
    if (isSubmitting) return

    if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmissionError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setSubmissionError('Passwords do not match.')
      return
    }

    setSubmissionError('')
    setIsSubmitting(true)

    const result = await resetPassword(token, password)

    if (result.ok) {
      setIsSucceeded(true)
      setIsSubmitting(false)
      return
    }

    setSubmissionError(result.error)
    setIsSubmitting(false)
  }

  if (isSucceeded) {
    return (
      <>
        <h1 className={styles.heading}>Password reset</h1>
        <p className={styles.subtitle}>
          Your password has been updated. Redirecting you to sign in…
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className={styles.heading}>Choose a new password</h1>
      <p className={styles.subtitle}>
        Pick something you haven&apos;t used before. At least 8 characters.
      </p>

      <form className={styles.form} onSubmit={handleFormSubmit} noValidate>
        <ErrorMessage message={submissionError} />

        <FormInput
          label="New password"
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
          disabled={isSubmitting}
        />

        <FormInput
          label="Confirm new password"
          type="password"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
          disabled={isSubmitting}
        />

        <SubmitButton
          label="Reset password"
          loadingLabel="Saving…"
          isLoading={isSubmitting}
        />
      </form>

      <p className={styles.footer}>
        <Link href={ROUTES.LOGIN} className={styles.loginLink}>
          Back to sign in
        </Link>
      </p>
    </>
  )
}
