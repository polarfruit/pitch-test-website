'use client'

import FoundingPhaseCallout from '../FoundingPhaseCallout'
import SubmitButton from '../SubmitButton'
import ErrorMessage from '../ErrorMessage'
import styles from '../SignupWizard.module.css'

const PLAN_OPTIONS = [
  {
    value: 'free',
    name: 'Free',
    price: '$0',
    priceUnit: '/mo',
    priceDesc: 'Forever free',
    featured: false,
  },
  {
    value: 'pro',
    name: 'Pro',
    price: '$29',
    priceUnit: '/mo',
    priceDesc: 'Billed monthly · Cancel anytime',
    featured: true,
  },
  {
    value: 'growth',
    name: 'Growth',
    price: '$79',
    priceUnit: '/mo',
    priceDesc: 'Billed monthly · Cancel anytime',
    featured: false,
  },
]

export default function VendorStep5Plan({
  formData,
  updateField,
  onSubmit,
  onBack,
  isSubmitting,
  submissionError,
}) {
  function handleFormSubmit(event) {
    event.preventDefault()
    if (isSubmitting) return
    onSubmit()
  }

  return (
    <form className={styles.form} onSubmit={handleFormSubmit} noValidate>
      <h2 className={styles.heading}>Choose your plan</h2>
      <p className={styles.subtitle}>You can upgrade or downgrade at any time from your dashboard.</p>

      <div className={styles.planCards} role="radiogroup" aria-label="Vendor plan">
        {PLAN_OPTIONS.map((plan) => {
          const isSelected = formData.plan === plan.value
          const classNames = [
            styles.planCard,
            plan.featured ? styles.planFeatured : '',
            isSelected ? styles.planCardSelected : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={plan.value}
              type="button"
              className={classNames}
              onClick={() => updateField('plan', plan.value)}
              role="radio"
              aria-checked={isSelected}
            >
              {plan.featured ? <span className={styles.planFeaturedLabel}>Most popular</span> : null}
              <p className={styles.planName}>{plan.name}</p>
              <p className={styles.planPrice}>
                {plan.price}<span>{plan.priceUnit}</span>
              </p>
              <p className={styles.planPriceDesc}>{plan.priceDesc}</p>
            </button>
          )
        })}
      </div>

      <FoundingPhaseCallout />

      <ErrorMessage message={submissionError} />

      <SubmitButton
        label="Create my account 🎉"
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
