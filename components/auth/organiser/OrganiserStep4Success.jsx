import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import styles from '../SignupWizard.module.css'

export default function OrganiserStep4Success() {
  return (
    <div className={styles.successPanel}>
      <div className={styles.successIcon} aria-hidden="true">🎉</div>
      <h2 className={styles.successHeading}>You&apos;re all set!</h2>
      <p className={styles.successSub}>
        Your organiser account is live. Start posting events and filling your stalls with Adelaide&apos;s top food vendors.
      </p>

      <div className={styles.successChecklist}>
        <div className={styles.successCheckItem}>
          <span className={styles.successCheckIcon}>✓</span>
          <span>Account created</span>
        </div>
        <div className={styles.successCheckItem}>
          <span className={styles.successCheckIcon}>✓</span>
          <span>Organisation profile set up</span>
        </div>
        <div className={styles.successCheckItem}>
          <span className={styles.successCheckIcon}>⏳</span>
          <span>ABN verification pending</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Link
          href={ROUTES.EVENTS_NEW}
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
          Post your first event →
        </Link>
        <Link
          href={ROUTES.DASHBOARD_ORGANISER}
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
