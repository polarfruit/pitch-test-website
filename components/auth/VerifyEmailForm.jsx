'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resendEmailCode, verifyEmailCode } from '@/lib/auth'
import { VERIFY_EMAIL_RESEND_COOLDOWN_SECONDS } from '@/constants/timing'
import { useCooldownTimer } from '@/lib/hooks/useCooldownTimer'
import SubmitButton from './SubmitButton'
import ErrorMessage from './ErrorMessage'
import styles from './VerifyEmailForm.module.css'

const CODE_LENGTH = 6

export default function VerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''

  const [digits, setDigits] = useState(() => Array(CODE_LENGTH).fill(''))
  const [submissionError, setSubmissionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const inputRefs = useRef([])
  const { secondsRemaining, isActive: isCoolingDown, start: startCooldown } = useCooldownTimer()

  const code = useMemo(() => digits.join(''), [digits])
  const isComplete = code.length === CODE_LENGTH && digits.every((digit) => digit !== '')

  function focusInput(index) {
    const input = inputRefs.current[index]
    if (input) input.focus()
  }

  function updateDigitAt(index, nextValue) {
    setDigits((previous) => {
      const next = [...previous]
      next[index] = nextValue
      return next
    })
  }

  function handleDigitChange(index, rawValue) {
    const onlyDigits = rawValue.replace(/\D/g, '')
    if (!onlyDigits) {
      updateDigitAt(index, '')
      return
    }
    if (onlyDigits.length === 1) {
      updateDigitAt(index, onlyDigits)
      if (index < CODE_LENGTH - 1) focusInput(index + 1)
      return
    }
    // Pasted multi-digit content — distribute across remaining boxes.
    const chunk = onlyDigits.slice(0, CODE_LENGTH - index).split('')
    setDigits((previous) => {
      const next = [...previous]
      chunk.forEach((digit, offset) => {
        next[index + offset] = digit
      })
      return next
    })
    const targetIndex = Math.min(index + chunk.length, CODE_LENGTH - 1)
    focusInput(targetIndex)
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      updateDigitAt(index - 1, '')
      focusInput(index - 1)
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusInput(index - 1)
      return
    }
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault()
      focusInput(index + 1)
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault()
    if (isSubmitting || !isComplete) return

    setSubmissionError('')
    setSuccessMessage('')
    setIsSubmitting(true)

    const result = await verifyEmailCode(code)

    if (result.ok) {
      setSuccessMessage('Email verified. Redirecting…')
      router.push(result.redirect)
      return
    }

    setSubmissionError(result.error)
    setIsSubmitting(false)
  }

  async function handleResendClick() {
    if (isResending || isCoolingDown) return
    setSubmissionError('')
    setSuccessMessage('')
    setIsResending(true)

    const result = await resendEmailCode()

    if (result.ok) {
      setSuccessMessage('New code sent. Check your inbox.')
      startCooldown(VERIFY_EMAIL_RESEND_COOLDOWN_SECONDS)
    } else {
      setSubmissionError(result.error)
    }
    setIsResending(false)
  }

  return (
    <>
      <h1 className={styles.heading}>Verify your email</h1>
      <p className={styles.subtitle}>
        We&apos;ve sent a 6-digit code to{' '}
        <span className={styles.emailHighlight}>{email || 'your email address'}</span>. Enter it
        below to activate your account.
      </p>

      <form className={styles.form} onSubmit={handleFormSubmit} noValidate>
        <ErrorMessage message={submissionError} />
        {successMessage ? <p className={styles.success} role="status">{successMessage}</p> : null}

        <div className={styles.codeRow} role="group" aria-label="6-digit verification code">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => { inputRefs.current[index] = element }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={CODE_LENGTH}
              value={digit}
              onChange={(event) => handleDigitChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              className={styles.codeBox}
              aria-label={`Digit ${index + 1}`}
              disabled={isSubmitting}
              autoFocus={index === 0}
            />
          ))}
        </div>

        <SubmitButton
          label="Verify email"
          loadingLabel="Verifying…"
          isLoading={isSubmitting}
          disabled={!isComplete}
        />

        <button
          type="button"
          className={styles.resendButton}
          onClick={handleResendClick}
          disabled={isResending || isCoolingDown}
        >
          {isCoolingDown ? `Resend code in ${secondsRemaining}s` : isResending ? 'Sending…' : 'Resend code'}
        </button>
      </form>
    </>
  )
}
