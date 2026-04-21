'use client'

import { useState, useCallback } from 'react'
import styles from './VendorDetail.module.css'

export default function VendorContactModal({
  vendor,
  organiserUserId,
  onClose,
  onMessageSent,
}) {
  const [messageBody, setMessageBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const handleBackdropClick = useCallback(() => {
    if (!isSubmitting) onClose()
  }, [isSubmitting, onClose])

  const handleFormSubmit = useCallback(async (event) => {
    event.preventDefault()
    const trimmedMessage = messageBody.trim()
    if (!trimmedMessage) {
      setSubmitError('Message cannot be empty.')
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const threadResponse = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          vendor_user_id: vendor.userId,
          organiser_user_id: organiserUserId,
        }),
      })
      if (!threadResponse.ok) throw new Error(`thread ${threadResponse.status}`)
      const { thread_key: threadKey } = await threadResponse.json()
      if (!threadKey) throw new Error('missing thread_key')

      const messageResponse = await fetch(`/api/messages/${threadKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: trimmedMessage }),
      })
      if (!messageResponse.ok) throw new Error(`send ${messageResponse.status}`)

      onMessageSent()
    } catch (error) {
      console.error('[VendorContactModal.handleFormSubmit]', {
        message: error.message,
        endpoint: '/api/messages',
        timestamp: new Date().toISOString(),
      })
      setSubmitError('We could not send your message. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [messageBody, vendor.userId, organiserUserId, onMessageSent])

  return (
    <div className={styles.modalBackdrop} onClick={handleBackdropClick}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-heading"
        onClick={event => event.stopPropagation()}
      >
        <h2 id="contact-modal-heading" className={styles.modalHeading}>
          Message {vendor.tradingName}
        </h2>
        <form onSubmit={handleFormSubmit} className={styles.contactForm}>
          <label htmlFor="contact-message" className={styles.formLabel}>
            Your message
          </label>
          <textarea
            id="contact-message"
            className={styles.formTextarea}
            value={messageBody}
            onChange={event => setMessageBody(event.target.value)}
            placeholder="Hi — we'd love to have you at our upcoming event…"
            rows={5}
            disabled={isSubmitting}
            required
          />
          {submitError ? (
            <p className={styles.formError} role="alert">{submitError}</p>
          ) : null}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
