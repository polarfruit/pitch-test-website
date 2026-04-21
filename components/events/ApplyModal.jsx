'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { APPLY_MESSAGE_MAX_CHARS } from '@/constants/limits'
import styles from './ApplyModal.module.css'

const MIN_MESSAGE_LENGTH = 20

function deriveErrorCopy(status) {
  if (status === 401) {
    return {
      heading: 'Sign in required',
      body: 'Your session expired. Please sign back in and try again.',
    }
  }
  if (status === 409) {
    return {
      heading: 'Already applied',
      body: "You've already applied to this event. Check your vendor dashboard for status updates.",
    }
  }
  if (status === 429) {
    return {
      heading: 'Application limit reached',
      body: "You've hit your free-tier application limit this month. Upgrade to Pro for unlimited applications.",
    }
  }
  return {
    heading: 'Something went wrong',
    body: 'We could not submit your application. Please try again in a moment.',
  }
}

function ApplyModal({ event, onClose, onSubmitted }) {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorCopy, setErrorCopy] = useState(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const dialogRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(keyboardEvent) {
      if (keyboardEvent.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, onClose])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  const trimmedLength = message.trim().length
  const isMessageValid = trimmedLength >= MIN_MESSAGE_LENGTH && message.length <= APPLY_MESSAGE_MAX_CHARS
  const remaining = APPLY_MESSAGE_MAX_CHARS - message.length

  async function handleFormSubmit(formEvent) {
    formEvent.preventDefault()
    if (!isMessageValid || isSubmitting) return
    setIsSubmitting(true)
    setErrorCopy(null)
    try {
      const response = await fetch(`/api/events/${event.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: message.trim() }),
      })
      if (!response.ok) {
        console.error('[ApplyModal]', {
          message: `Application submission failed: ${response.status} ${response.statusText}`,
          endpoint: `/api/events/${event.id}/apply`,
          status: response.status,
          timestamp: new Date().toISOString(),
        })
        setErrorCopy(deriveErrorCopy(response.status))
        return
      }
      setIsSubmitted(true)
      onSubmitted?.()
    } catch (error) {
      console.error('[ApplyModal]', {
        message: error.message,
        endpoint: `/api/events/${event.id}/apply`,
        status: 'network_failure',
        timestamp: new Date().toISOString(),
      })
      setErrorCopy(deriveErrorCopy(0))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleOverlayClick(clickEvent) {
    if (clickEvent.target === clickEvent.currentTarget && !isSubmitting) {
      onClose()
    }
  }

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-modal-title"
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close"
        >
          ×
        </button>

        {isSubmitted ? (
          <div className={styles.successPane}>
            <div className={styles.successIcon}>✓</div>
            <h2 id="apply-modal-title" className={styles.heading}>
              Application submitted
            </h2>
            <p className={styles.lede}>
              The organiser of <strong>{event.name}</strong> will review your application and respond via email.
              You can track the status from your vendor dashboard.
            </p>
            <div className={styles.successActions}>
              <Link href="/dashboard-vendor" className={styles.primaryBtn}>
                Go to dashboard
              </Link>
              <button type="button" className={styles.secondaryBtn} onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className={styles.form}>
            <div className={styles.header}>
              <div className={styles.eyebrow}>Apply to this event</div>
              <h2 id="apply-modal-title" className={styles.heading}>
                {event.name}
              </h2>
              <p className={styles.lede}>
                Tell the organiser why your stall is a fit for this event. Include your cuisine, what you plan to
                serve, and any prior market experience.
              </p>
            </div>

            <label className={styles.fieldLabel} htmlFor="apply-message">
              Your pitch to the organiser
            </label>
            <textarea
              id="apply-message"
              ref={textareaRef}
              className={styles.textarea}
              value={message}
              onChange={event => setMessage(event.target.value)}
              placeholder="Hi! I run a wood-fired pizza stall based in Adelaide..."
              maxLength={APPLY_MESSAGE_MAX_CHARS}
              rows={8}
              disabled={isSubmitting}
              required
            />
            <div className={styles.meta}>
              <span className={trimmedLength < MIN_MESSAGE_LENGTH ? styles.metaHint : styles.metaHintOk}>
                {trimmedLength < MIN_MESSAGE_LENGTH
                  ? `At least ${MIN_MESSAGE_LENGTH} characters`
                  : 'Looks good'}
              </span>
              <span className={styles.counter}>{remaining} characters left</span>
            </div>

            {errorCopy && (
              <div className={styles.errorBox} role="alert">
                <strong>{errorCopy.heading}</strong>
                <span>{errorCopy.body}</span>
              </div>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={!isMessageValid || isSubmitting}
              >
                {isSubmitting ? 'Submitting…' : 'Submit application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default ApplyModal
