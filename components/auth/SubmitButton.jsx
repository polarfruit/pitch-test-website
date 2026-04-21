import styles from './SubmitButton.module.css'

export default function SubmitButton({
  label,
  loadingLabel = 'Signing in…',
  isLoading = false,
  disabled = false,
}) {
  const isButtonDisabled = disabled || isLoading
  return (
    <button
      type="submit"
      className={styles.button}
      disabled={isButtonDisabled}
      aria-busy={isLoading}
    >
      {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span>{isLoading ? loadingLabel : label}</span>
    </button>
  )
}
