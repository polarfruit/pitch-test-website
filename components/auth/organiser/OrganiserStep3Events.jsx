'use client'

import { useState } from 'react'
import SubmitButton from '../SubmitButton'
import ErrorMessage from '../ErrorMessage'
import styles from '../SignupWizard.module.css'

const EVENT_TYPES = [
  'Night markets', 'Food festivals', 'Street fairs', 'Corporate events',
  'Farmers markets', 'Pop-up events', 'Music festivals', 'Sports events',
  'Community events', 'Private functions',
]

const EVENT_SCALES = [
  { value: 'Small', icon: '🏠', label: 'Small — up to 500 attendees', sub: 'Intimate events, neighbourhood markets, pop-ups' },
  { value: 'Medium', icon: '🏙', label: 'Medium — 500–5,000 attendees', sub: 'Night markets, street fairs, community festivals' },
  { value: 'Large', icon: '🎪', label: 'Large — 5,000+ attendees', sub: 'Major festivals, council events, multi-day expos' },
]

const STALL_RANGES = ['1–5 stalls', '5–10 stalls', '10–20 stalls', '20–30 stalls', '30–50 stalls', '50+ stalls']

const REFERRAL_OPTIONS = [
  { value: 'Google / Search', icon: '🔍' },
  { value: 'Instagram / Social', icon: '📸' },
  { value: 'Word of mouth', icon: '🤝' },
  { value: 'Press / media', icon: '📰' },
  { value: 'Email / newsletter', icon: '📧' },
  { value: 'Other', icon: '💬' },
]

export default function OrganiserStep3Events({
  formData,
  updateField,
  onSubmit,
  onBack,
  isSubmitting,
  submissionError,
}) {
  const [stepError, setStepError] = useState('')

  function toggleEventType(tag) {
    const next = formData.event_types.includes(tag)
      ? formData.event_types.filter((item) => item !== tag)
      : [...formData.event_types, tag]
    updateField('event_types', next)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (formData.event_types.length === 0) {
      setStepError('Please select at least one event type.')
      return
    }
    setStepError('')
    onSubmit()
  }

  const stallIndex = STALL_RANGES.indexOf(formData.stall_range)

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <h2 className={styles.heading}>About your events</h2>
      <p className={styles.subtitle}>Help us match you with the right vendors.</p>

      <ErrorMessage message={stepError || submissionError} />

      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>What types of events do you run? (select all that apply)</p>
        <div className={styles.tagRow} role="group" aria-label="Event types">
          {EVENT_TYPES.map((tag) => {
            const isSelected = formData.event_types.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                className={`${styles.tag} ${isSelected ? styles.tagSelected : ''}`}
                onClick={() => toggleEventType(tag)}
                aria-pressed={isSelected}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>Typical event scale</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} role="radiogroup" aria-label="Event scale">
          {EVENT_SCALES.map((scale) => {
            const isSelected = formData.event_scale === scale.value
            return (
              <button
                key={scale.value}
                type="button"
                className={`${styles.radioCard} ${isSelected ? styles.radioCardSelected : ''}`}
                onClick={() => updateField('event_scale', scale.value)}
                role="radio"
                aria-checked={isSelected}
                style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '14px' }}
              >
                <div className={styles.radioCardIcon} style={{ margin: 0 }}>{scale.icon}</div>
                <div>
                  <div className={styles.radioCardLabel} style={{ marginBottom: '3px' }}>{scale.label}</div>
                  <div className={styles.radioCardSub}>{scale.sub}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="stallRange">Typical stall count per event</label>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: '22px',
          color: 'var(--text-hi)',
          textAlign: 'center',
          padding: '10px 0',
        }}>
          {formData.stall_range}
        </div>
        <input
          id="stallRange"
          type="range"
          min="0"
          max={STALL_RANGES.length - 1}
          value={stallIndex >= 0 ? stallIndex : 3}
          onChange={(event) => updateField('stall_range', STALL_RANGES[Number(event.target.value)])}
          style={{ width: '100%', accentColor: 'var(--ember)' }}
          aria-label="Stall count range"
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          color: 'var(--text-lo)',
          marginTop: '4px',
        }}>
          <span>1–5</span><span>5–10</span><span>10–20</span><span>20–30</span><span>30–50</span><span>50+</span>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>How did you hear about Pitch.?</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '8px',
          }}
          role="radiogroup"
          aria-label="Referral source"
        >
          {REFERRAL_OPTIONS.map((option) => {
            const isSelected = formData.referral === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={`${styles.radioCard} ${isSelected ? styles.radioCardSelected : ''}`}
                onClick={() => updateField('referral', option.value)}
                role="radio"
                aria-checked={isSelected}
                style={{ padding: '12px 10px' }}
              >
                <div className={styles.radioCardIcon}>{option.icon}</div>
                <div className={styles.radioCardLabel} style={{ fontSize: '12px' }}>{option.value}</div>
              </button>
            )
          })}
        </div>
      </div>

      <SubmitButton
        label="Submit →"
        loadingLabel="Sending verification code…"
        isLoading={isSubmitting}
      />

      <div className={styles.stepActions}>
        <button type="button" className={styles.backButton} onClick={onBack} disabled={isSubmitting}>
          ← Back
        </button>
        <span />
      </div>
    </form>
  )
}
