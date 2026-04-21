import styles from './FormInput.module.css'

export default function FormInput({
  label,
  type = 'text',
  name,
  value,
  onChange,
  error = '',
  placeholder = '',
  required = false,
  disabled = false,
  autoComplete,
}) {
  const errorId = error ? `${name}-error` : undefined
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`${styles.input} ${error ? styles.hasError : ''}`}
      />
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
