'use client'

import { useState } from 'react'
import FormInput from '../FormInput'
import ErrorMessage from '../ErrorMessage'
import { verifyABN } from '@/lib/auth'
import styles from '../SignupWizard.module.css'

const AUSTRALIAN_STATES = ['SA', 'VIC', 'NSW', 'QLD', 'WA', 'TAS', 'ACT', 'NT']

export default function VendorStep2Business({ formData, updateField, onNext, onBack }) {
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
      trading_name: formData.trading_name,
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
    if (!formData.trading_name.trim()) {
      setStepError('Please enter your trading name.')
      return
    }
    if (formData.abn && formData.abn.replace(/\s/g, '').length !== 11) {
      setStepError('ABN must be exactly 11 digits, or left blank.')
      return
    }
    if (!formData.suburb.trim()) {
      setStepError('Please enter your home suburb.')
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
      <h2 className={styles.heading}>Your business</h2>
      <p className={styles.subtitle}>This information will appear on your public vendor profile.</p>

      <ErrorMessage message={stepError} />

      <FormInput
        label="Trading / business name"
        name="trading_name"
        value={formData.trading_name}
        onChange={(event) => updateField('trading_name', event.target.value)}
        placeholder="e.g. Smoky Joe's BBQ"
        required
      />

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="abn">Australian Business Number</label>
        <div className={styles.abnRow}>
          <input
            id="abn"
            className={styles.abnInput}
            type="text"
            maxLength={14}
            value={formData.abn}
            onChange={(event) => updateField('abn', formatAbnInput(event.target.value))}
            placeholder="11 digits e.g. 51 824 753 556"
            autoComplete="off"
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
        <p className={styles.fieldHint}>We verify your ABN to display a verified badge on your profile.</p>
      </div>

      <div className={styles.row}>
        <FormInput
          label="Mobile"
          name="mobile"
          type="tel"
          value={formData.mobile}
          onChange={(event) => updateField('mobile', event.target.value)}
          autoComplete="tel"
          placeholder="+61 4XX XXX XXX"
        />
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="state">State</label>
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
      </div>

      <FormInput
        label="Suburb (home base)"
        name="suburb"
        value={formData.suburb}
        onChange={(event) => updateField('suburb', event.target.value)}
        placeholder="e.g. Norwood"
        required
      />

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="bio">Short bio</label>
        <textarea
          id="bio"
          name="bio"
          className={styles.textarea}
          value={formData.bio}
          onChange={(event) => updateField('bio', event.target.value)}
          placeholder="Tell organisers who you are, what you serve, and what makes you great at events…"
        />
      </div>

      <div className={styles.stepActions}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← Back
        </button>
        <button type="submit" className={styles.nextButton}>
          Next: Your setup →
        </button>
      </div>
    </form>
  )
}
