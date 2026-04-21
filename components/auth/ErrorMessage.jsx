import styles from './ErrorMessage.module.css'

export default function ErrorMessage({ message }) {
  if (!message) return null
  return (
    <div role="alert" className={styles.alert}>
      {message}
    </div>
  )
}
