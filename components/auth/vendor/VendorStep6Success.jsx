import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import styles from '../SignupWizard.module.css'

export default function VendorStep6Success() {
  return (
    <div className={styles.successPanel}>
      <div className={styles.successIcon} aria-hidden="true">🎉</div>
      <h2 className={styles.successHeading}>You&apos;re on Pitch.</h2>
      <p className={styles.successSub}>
        Your vendor profile has been created. Your documents are being reviewed — you&apos;ll get an email when your Verified badge is live.
      </p>

      <div className={styles.successChecklist}>
        <div className={styles.successCheckItem}>
          <span className={styles.successCheckIcon}>✓</span>
          <span>Account created</span>
        </div>
        <div className={styles.successCheckItem}>
          <span className={styles.successCheckIcon}>✓</span>
          <span>Business profile set up</span>
        </div>
        <div className={styles.successCheckItem}>
          <span className={styles.successCheckIcon}>⏳</span>
          <span>Documents under review (usually 1–2 business days)</span>
        </div>
        <div className={styles.successCheckItem}>
          <span className={styles.successCheckIcon}>⏳</span>
          <span>ABN verification pending</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Link
          href={ROUTES.EVENTS}
          style={{
            padding: '14px 20px',
            background: 'var(--ember)',
            color: 'var(--text-hi)',
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: '14px',
            borderRadius: '10px',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          Browse events and apply →
        </Link>
        <Link
          href={ROUTES.DASHBOARD_VENDOR}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            color: 'var(--text-mid)',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: '14px',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          Go to my dashboard
        </Link>
      </div>
    </div>
  )
}
