'use client'

import { useState } from 'react'
import styles from './ContactPage.module.css'

const INITIAL_FORM = { name: '', email: '', role: '', subject: '', message: '' }

export default function ContactPage() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitState, setSubmitState] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')

  function handleFieldChange(event) {
    const { name, value } = event.target
    setForm(previous => ({ ...previous, [name]: value }))
  }

  async function handleFormSubmit(event) {
    event.preventDefault()
    setSubmitState('loading')
    setErrorMessage('')
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong')
      }
      setSubmitState('success')
    } catch (error) {
      console.error('[ContactPage]', {
        message: error.message,
        endpoint: '/api/contact',
        timestamp: new Date().toISOString(),
      })
      setErrorMessage(error.message || 'Failed to send message. Please try again.')
      setSubmitState('error')
    }
  }

  const isSubmitting = submitState === 'loading'
  const isSuccess = submitState === 'success'

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroHeading}>Get in touch.</h1>
        <p className={styles.heroBody}>We typically respond within one business day.</p>
      </div>

      <div className={styles.contactLayout}>
        <div className={styles.formCard}>
          {isSuccess ? (
            <div className={styles.successMsg}>
              <div className={styles.successIcon}>✓</div>
              <h3>Message sent!</h3>
              <p>
                Thanks for reaching out. We&apos;ll get back to you within one business
                day at the email address you provided.
              </p>
            </div>
          ) : (
            <>
              <h2 className={styles.formHeading}>Send us a message</h2>
              <form onSubmit={handleFormSubmit} noValidate={false}>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="contact-name">Your name</label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      value={form.name}
                      onChange={handleFieldChange}
                      placeholder="Jane Doe"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="contact-email">Email</label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleFieldChange}
                      placeholder="jane@example.com"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="contact-role">I&apos;m a</label>
                    <select
                      id="contact-role"
                      name="role"
                      value={form.role}
                      onChange={handleFieldChange}
                      required
                      disabled={isSubmitting}
                    >
                      <option value="" disabled>Select your role</option>
                      <option value="foodie">Foodie</option>
                      <option value="vendor">Vendor</option>
                      <option value="organiser">Organiser</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="contact-subject">Subject</label>
                    <input
                      id="contact-subject"
                      name="subject"
                      type="text"
                      value={form.subject}
                      onChange={handleFieldChange}
                      placeholder="e.g. Question about Pro plan"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    name="message"
                    value={form.message}
                    onChange={handleFieldChange}
                    placeholder="Tell us what's on your mind..."
                    required
                    disabled={isSubmitting}
                  />
                </div>
                {submitState === 'error' ? (
                  <div className={styles.errorMsg} role="alert">{errorMessage}</div>
                ) : null}
                <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                  {isSubmitting ? 'Sending…' : 'Send message'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className={styles.infoStack}>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>✉️</div>
            <div className={styles.infoBody}>
              <h4>Email</h4>
              <a href="mailto:hello@onpitch.com.au">hello@onpitch.com.au</a>
              <div className={styles.infoSub}>General enquiries &amp; support</div>
            </div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>📍</div>
            <div className={styles.infoBody}>
              <h4>Location</h4>
              <span>Adelaide, South Australia</span>
              <div className={styles.infoSub}>We&apos;re a local team, building for local markets</div>
            </div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>🕐</div>
            <div className={styles.infoBody}>
              <h4>Business hours</h4>
              <span>Mon–Fri, 9am–5pm ACST</span>
              <div className={styles.infoSub}>We aim to respond within 1 business day</div>
            </div>
          </div>
          <div className={styles.noteCard}>
            <p>
              <strong>For legal or privacy enquiries</strong> — please email{' '}
              <a href="mailto:legal@onpitch.com.au">legal@onpitch.com.au</a> or{' '}
              <a href="mailto:privacy@onpitch.com.au">privacy@onpitch.com.au</a> directly.
              These are monitored separately from our general inbox.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
