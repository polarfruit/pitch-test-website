'use client'

import { useState } from 'react'
import FormInput from '../FormInput'
import ErrorMessage from '../ErrorMessage'
import { verifyABN } from '@/lib/auth'
import styles from '../SignupWizard.module.css'

const AUSTRALIAN_STATES = ['SA', 'VIC', 'NSW', 'QLD', 'WA', 'TAS', 'ACT', 'NT']
const BIO_MIN_LENGTH = 40

export default function OrganiserStep2Organisation({ formData, updateField, onNext, onBack }) {
  const [stepError, setStepError] = useState('')
  const [abnStatus, setAbnStatus] = useState('idle')
  const [abnMessage, setAbnMessage] = useState('')

  function formatAbnInput(raw) {
    return raw.replace(/[^\d\s]/g, '')
  }

  async function handleVerifyAbn() {
    const abnDigits = formData.abn.replace(/\s/g, '')
    if (abnDigits.length !== 11) {
      setAbnStatus('fail')
      setAbnMessage('Please enter an 11-digit ABN.')
      return
    }

    setAbnStatus('loading')
    setAbnMessage('Verifying with ABR…')

    const result = await verifyABN(abnDigits, {
      first_name: formData.first_name,
      last_name: formData.last_name,
      trading_name: formData.org_name,
      email: formData.email,
    })

    if (!result.ok || !result.valid) {
      setAbnStatus('fail')
      setAbnMessage(result.error || 'ABN could not be verified.')
      return
    }

    setAbnStatus('success')
    setAbnMessage(result.entityName ? `ABN verified — ${result.entityName}` : 'ABN format is valid')
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!formData.org_name.trim()) {
      setStepError('Please enter your organisation name.')
      return
    }
    if (formData.abn && formData.abn.replace(/\s/g, '').length !== 11) {
      setStepError('ABN must be exactly 11 digits, or left blank.')
      return
    }
    if (!formData.suburb.trim()) {
      setStepError('Please enter your suburb.')
      return
    }
    if (formData.bio.trim().length < BIO_MIN_LENGTH) {
      setStepError(`Organisation bio must be at least ${BIO_MIN_LENGTH} characters.`)
      return
    }
    setStepError('')
    onNext()
  }

  const abnClassName = abnStatus === 'success'
    ? `${styles.abnResult} ${styles.abnResultSuccess}`
    : abnStatus === 'fail'
    ? `${styles.abnResult} ${styles.abnResultFail}`
    : abnStatus === 'loading'
    ? `${styles.abnResult} ${styles.abnResultLoading}`
    : ''

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <h2 className={styles.heading}>Your organisation</h2>
      <p className={styles.subtitle}>Tell us about who&apos;s running the show.</p>

      <ErrorMessage message={stepError} />

      <FormInput
        label="Organisation / Trading name"
        name="org_name"
        value={formData.org_name}
        onChange={(event) => updateField('org_name', event.target.value)}
        placeholder="Adelaide City Council Events"
        required
      />

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="abn">Australian Business Number</label>
        <div className={styles.abnRow}>
          <input
            id="abn"
            type="text"
            maxLength={14}
            value={formData.abn}
            onChange={(event) => updateField('abn', formatAbnInput(event.target.value))}
            placeholder="XX XXX XXX XXX"
            autoComplete="off"
            className={styles.abnInput}
          />
          <button
            type="button"
            className={styles.abnBtn}
            onClick={handleVerifyAbn}
            disabled={abnStatus === 'loading'}
          >
            {abnStatus === 'loading' ? 'Verifying…' : 'Verify'}
          </button>
        </div>
        {abnStatus !== 'idle' ? (
          <div className={abnClassName} role="status">
            {abnMessage}
          </div>
        ) : null}
        <p className={styles.fieldHint}>ABN lookup confirms your organisation is registered and active.</p>
      </div>

      <FormInput
        label="Website (optional)"
        type="url"
        name="website"
        value={formData.website}
        onChange={(event) => updateField('website', event.target.value)}
        placeholder="https://events.example.com.au"
        autoComplete="url"
      />

      <div className={styles.row}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="state">State / Territory</label>
          <select
            id="state"
            name="state"
            className={styles.select}
            value={formData.state}
            onChange={(event) => updateField('state', event.target.value)}
          >
            {AUSTRALIAN_STATES.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </div>
        <FormInput
          label="Suburb"
          name="suburb"
          value={formData.suburb}
          onChange={(event) => updateField('suburb', event.target.value)}
          placeholder="Adelaide"
          required
        />
      </div>

      <FormInput
        label="Phone number"
        name="phone"
        type="tel"
        value={formData.phone}
        onChange={(event) => updateField('phone', event.target.value)}
        autoComplete="tel"
        placeholder="+61 4XX XXX XXX"
      />

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="bio">Organisation bio</label>
        <textarea
          id="bio"
          name="bio"
          className={styles.textarea}
          value={formData.bio}
          onChange={(event) => updateField('bio', event.target.value)}
          placeholder="Tell vendors a bit about your organisation and the kinds of events you run…"
        />
        <p className={styles.fieldHint}>This appears on your organiser profile page. Min. {BIO_MIN_LENGTH} characters.</p>
      </div>

      <div className={styles.stepActions}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← Back
        </button>
        <button type="submit" className={styles.nextButton}>
          Continue →
        </button>
      </div>
    </form>
  )
}
