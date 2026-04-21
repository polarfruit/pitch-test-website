'use client'

import { useState } from 'react'
import FormInput from '../FormInput'
import ErrorMessage from '../ErrorMessage'
import { CUISINE_OPTIONS, SETUP_OPTIONS, PRICE_OPTIONS } from './vendor-options'
import styles from '../SignupWizard.module.css'

export default function VendorStep3Setup({ formData, updateField, onNext, onBack }) {
  const [stepError, setStepError] = useState('')

  function toggleCuisineTag(tag) {
    const next = formData.cuisine_tags.includes(tag)
      ? formData.cuisine_tags.filter((item) => item !== tag)
      : [...formData.cuisine_tags, tag]
    updateField('cuisine_tags', next)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (formData.cuisine_tags.length === 0) {
      setStepError('Please select at least one cuisine type.')
      return
    }
    const width = Number(formData.stall_w)
    const depth = Number(formData.stall_d)
    if (!Number.isFinite(width) || width < 1 || width > 20) {
      setStepError('Stall width must be between 1 and 20 metres.')
      return
    }
    if (!Number.isFinite(depth) || depth < 1 || depth > 20) {
      setStepError('Stall depth must be between 1 and 20 metres.')
      return
    }
    setStepError('')
    onNext()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <h2 className={styles.heading}>Your setup</h2>
      <p className={styles.subtitle}>Help organisers understand what you need and what you bring.</p>

      <ErrorMessage message={stepError} />

      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>Cuisine types (select all that apply)</p>
        <div className={styles.tagRow} role="group" aria-label="Cuisine types">
          {CUISINE_OPTIONS.map((tag) => {
            const isSelected = formData.cuisine_tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                className={`${styles.tag} ${isSelected ? styles.tagSelected : ''}`}
                onClick={() => toggleCuisineTag(tag)}
                aria-pressed={isSelected}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>Setup type</p>
        <div className={styles.radioCards} role="radiogroup" aria-label="Setup type">
          {SETUP_OPTIONS.map((option) => {
            const isSelected = formData.setup_type === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={`${styles.radioCard} ${isSelected ? styles.radioCardSelected : ''}`}
                onClick={() => updateField('setup_type', option.value)}
                role="radio"
                aria-checked={isSelected}
              >
                <div className={styles.radioCardIcon}>{option.icon}</div>
                <div className={styles.radioCardLabel}>{option.label}</div>
                <div className={styles.radioCardSub}>{option.sub}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>Stall footprint (metres)</p>
        <div className={styles.dimRow}>
          <input
            type="number"
            min="1"
            max="20"
            value={formData.stall_w}
            onChange={(event) => updateField('stall_w', event.target.value)}
            className={styles.dimInput}
            aria-label="Stall width"
          />
          <span className={styles.dimSep}>×</span>
          <input
            type="number"
            min="1"
            max="20"
            value={formData.stall_d}
            onChange={(event) => updateField('stall_d', event.target.value)}
            className={styles.dimInput}
            aria-label="Stall depth"
          />
          <span className={styles.dimUnit}>m (width × depth)</span>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>Requirements</p>
        <div>
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Power required</div>
              <div className={styles.toggleSub}>15A single phase</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.power}
              aria-label="Power required"
              className={`${styles.toggle} ${formData.power ? styles.toggleOn : ''}`}
              onClick={() => updateField('power', !formData.power)}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Water connection needed</div>
              <div className={styles.toggleSub}>Running water at stall</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.water}
              aria-label="Water required"
              className={`${styles.toggle} ${formData.water ? styles.toggleOn : ''}`}
              onClick={() => updateField('water', !formData.water)}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>Price range</p>
        <div className={styles.priceGroup} role="radiogroup" aria-label="Price range">
          {PRICE_OPTIONS.map((option) => {
            const isActive = formData.price_range === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={`${styles.priceBtn} ${isActive ? styles.priceBtnActive : ''}`}
                onClick={() => updateField('price_range', option.value)}
                role="radio"
                aria-checked={isActive}
              >
                {option.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>({option.hint})</span>
              </button>
            )
          })}
        </div>
      </div>

      <FormInput
        label="Instagram handle (optional)"
        name="instagram"
        value={formData.instagram}
        onChange={(event) => updateField('instagram', event.target.value)}
        placeholder="@yourhandle"
      />

      <div className={styles.stepActions}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← Back
        </button>
        <button type="submit" className={styles.nextButton}>
          Next: Documents →
        </button>
      </div>
    </form>
  )
}
