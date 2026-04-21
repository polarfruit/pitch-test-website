'use client'

import { useState } from 'react'
import FormInput from '../FormInput'
import ErrorMessage from '../ErrorMessage'
import styles from '../SignupWizard.module.css'

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_COMPLEXITY = /^(?=.*\d)(?=.*[^A-Za-z0-9]).+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function OrganiserStep1Account({ formData, updateField, onNext }) {
  const [stepError, setStepError] = useState('')

  function validate() {
    if (!formData.first_name.trim()) return 'Please enter your first name.'
    if (!formData.last_name.trim()) return 'Please enter your last name.'
    if (!formData.email.trim() || !EMAIL_PATTERN.test(formData.email.trim())) {
      return 'Please enter a valid email address.'
    }
    if (formData.password.length < PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    }
    if (!PASSWORD_COMPLEXITY.test(formData.password)) {
      return 'Password must include a number and a symbol.'
    }
    if (formData.password !== formData.confirm_password) {
      return 'Passwords do not match.'
    }
    return ''
  }

  function handleSubmit(event) {
    event.preventDefault()
    const error = validate()
    if (error) {
      setStepError(error)
      return
    }
    setStepError('')
    onNext()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <h2 className={styles.heading}>Create your account</h2>
      <p className={styles.subtitle}>Start for free — no credit card required. Tell us about your organisation next.</p>

      <ErrorMessage message={stepError} />

      <div className={styles.row}>
        <FormInput
          label="First name"
          name="first_name"
          value={formData.first_name}
          onChange={(event) => updateField('first_name', event.target.value)}
          autoComplete="given-name"
          required
        />
        <FormInput
          label="Last name"
          name="last_name"
          value={formData.last_name}
          onChange={(event) => updateField('last_name', event.target.value)}
          autoComplete="family-name"
          required
        />
      </div>

      <FormInput
        label="Work email"
        type="email"
        name="email"
        value={formData.email}
        onChange={(event) => updateField('email', event.target.value)}
        autoComplete="email"
        placeholder="you@council.sa.gov.au"
        required
      />

      <FormInput
        label="Password"
        type="password"
        name="password"
        value={formData.password}
        onChange={(event) => updateField('password', event.target.value)}
        autoComplete="new-password"
        placeholder="Min 8 chars, 1 number, 1 symbol"
        required
      />

      <FormInput
        label="Confirm password"
        type="password"
        name="confirm_password"
        value={formData.confirm_password}
        onChange={(event) => updateField('confirm_password', event.target.value)}
        autoComplete="new-password"
        required
      />

      <div className={styles.stepActionsEnd}>
        <button type="submit" className={styles.nextButton}>
          Continue →
        </button>
      </div>
    </form>
  )
}
