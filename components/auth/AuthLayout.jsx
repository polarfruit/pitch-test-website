import Link from 'next/link'
import styles from './AuthLayout.module.css'

export default function AuthLayout({ children }) {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.logo} aria-label="Pitch. home">
        <span className={styles.logoDot} aria-hidden="true" />
        <span className={styles.logoText}>Pitch.</span>
      </Link>
      <main className={styles.card}>{children}</main>
    </div>
  )
}
