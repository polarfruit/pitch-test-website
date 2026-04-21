'use client'

import { useState } from 'react'
import Link from 'next/link'
import { forgotPassword } from '@/lib/auth'
import { ROUTES } from '@/constants/routes'
import FormInput from './FormInput'
import SubmitButton from './SubmitButton'
import ErrorMessage from './ErrorMessage'
import styles from './ForgotPasswordForm.module.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [submissionError, setSubmissionError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')

  async function handleFormSubmit(event) {
    event.preventDefault()
    if (isSubmitting) return

    const trimmed = email.trim()
    if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
      setSubmissionError('Enter a valid email address.')
      return
    }

    setSubmissionError('')
    setIsSubmitting(true)

    const result = await forgotPassword(trimmed)

    if (result.ok) {
      setSentEmail(trimmed)
      setIsSent(true)
      setIsSubmitting(false)
      return
    }

    setSubmissionError(result.error)
    setIsSubmitting(false)
  }

  if (isSent) {
    return (
      <>
        <h1 className={styles.heading}>Check your email</h1>
        <p className={styles.subtitle}>
          If an account exists for <span className={styles.emailHighlight}>{sentEmail}</span>,
          we&apos;ve sent a password reset link. It may take a minute to arrive.
        </p>
        <p className={styles.hint}>
          Didn&apos;t get it? Check your spam folder or{' '}
          <button type="button" className={styles.retryButton} onClick={() => setIsSent(false)}>
            try a different email
          </button>.
        </p>
        <p className={styles.footer}>
          <Link href={ROUTES.LOGIN} className={styles.loginLink}>
            Back to sign in
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className={styles.heading}>Reset your password</h1>
      <p className={styles.subtitle}>
        Enter the email address on your Pitch. account and we&apos;ll send you a reset link.
      </p>

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

        <SubmitButton
          label="Send reset link"
          loadingLabel="Sending…"
          isLoading={isSubmitting}
        />
      </form>

      <p className={styles.footer}>
        Remembered it?{' '}
        <Link href={ROUTES.LOGIN} className={styles.loginLink}>
          Back to sign in
        </Link>
      </p>
    </>
  )
}
