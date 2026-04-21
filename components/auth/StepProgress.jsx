import styles from './StepProgress.module.css'

export default function StepProgress({ currentStep, totalSteps, labels = [] }) {
  const steps = Array.from({ length: totalSteps }, (_, index) => index + 1)
  return (
    <ol className={styles.track} aria-label={`Step ${currentStep} of ${totalSteps}`}>
      {steps.map((step) => {
        const state = step < currentStep ? 'done' : step === currentStep ? 'current' : 'upcoming'
        const className = `${styles.step} ${styles[state]}`
        return (
          <li key={step} className={className}>
            <span className={styles.dot} aria-hidden="true">
              {state === 'done' ? '✓' : step}
            </span>
            {labels[step - 1] ? (
              <span className={styles.label}>{labels[step - 1]}</span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
