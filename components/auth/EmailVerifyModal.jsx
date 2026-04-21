'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { sendPresignupCode, verifyPresignupCode } from '@/lib/auth'
import { VERIFY_EMAIL_RESEND_COOLDOWN_SECONDS } from '@/constants/timing'
import { useCooldownTimer } from '@/lib/hooks/useCooldownTimer'
import SubmitButton from './SubmitButton'
import ErrorMessage from './ErrorMessage'
import styles from './EmailVerifyModal.module.css'

const CODE_LENGTH = 6

export default function EmailVerifyModal({
  email,
  devCode = null,
  onVerified,
  onCancel,
}) {
  const [digits, setDigits] = useState(() => Array(CODE_LENGTH).fill(''))
  const [modalError, setModalError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const inputRefs = useRef([])
  const { secondsRemaining, isActive: isCoolingDown, start: startCooldown } = useCooldownTimer()

  const code = useMemo(() => digits.join(''), [digits])
  const isComplete = code.length === CODE_LENGTH && digits.every((digit) => digit !== '')

  useEffect(() => {
    if (devCode) {
      const chunk = String(devCode).slice(0, CODE_LENGTH).split('')
      if (chunk.length === CODE_LENGTH) setDigits(chunk)
    }
    const firstInput = inputRefs.current[0]
    if (firstInput) firstInput.focus()
  }, [devCode])

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
    if (isVerifying || !isComplete) return

    setModalError('')
    setIsVerifying(true)

    const verifyResult = await verifyPresignupCode(email, code)
    if (!verifyResult.ok) {
      setModalError(verifyResult.error)
      setIsVerifying(false)
      return
    }

    // Hand off to orchestrator — it will create the account and redirect.
    await onVerified()
    setIsVerifying(false)
  }

  async function handleResendClick() {
    if (isResending || isCoolingDown) return
    setModalError('')
    setIsResending(true)
    const result = await sendPresignupCode(email)
    if (!result.ok) {
      setModalError(result.error)
    } else {
      startCooldown(VERIFY_EMAIL_RESEND_COOLDOWN_SECONDS)
      setDigits(Array(CODE_LENGTH).fill(''))
      focusInput(0)
    }
    setIsResending(false)
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="verifyHeading">
      <form className={styles.card} onSubmit={handleFormSubmit} noValidate>
        <div className={styles.icon} aria-hidden="true">📧</div>
        <h2 id="verifyHeading" className={styles.heading}>Verify your email</h2>
        <p className={styles.subtitle}>
          We&apos;ve sent a 6-digit code to{' '}
          <span className={styles.emailHighlight}>{email}</span>. Enter it below to finish creating your account.
        </p>

        {devCode ? (
          <p className={styles.devHint}>⚠ Dev mode: code auto-filled (email delivery unavailable)</p>
        ) : null}

        <ErrorMessage message={modalError} />

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
              disabled={isVerifying}
            />
          ))}
        </div>

        <SubmitButton
          label="Verify and create account"
          loadingLabel="Creating account…"
          isLoading={isVerifying}
          disabled={!isComplete}
        />

        <div className={styles.resendRow}>
          <button
            type="button"
            className={styles.resendButton}
            onClick={handleResendClick}
            disabled={isResending || isCoolingDown}
          >
            {isCoolingDown ? `Resend code in ${secondsRemaining}s` : isResending ? 'Sending…' : 'Resend code'}
          </button>
        </div>

        <div className={styles.cancelRow}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isVerifying}
          >
            Use a different email
          </button>
        </div>
      </form>
    </div>
  )
}
