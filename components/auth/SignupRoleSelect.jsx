import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import styles from './SignupRoleSelect.module.css'

export default function SignupRoleSelect() {
  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>How will you use Pitch?</h1>
      <p className={styles.subtitle}>
        Choose your role to get started. You can always create a second account later.
      </p>

      <Link href={ROUTES.SIGNUP_FOODIE} className={`${styles.card} ${styles.foodie}`}>
        <span className={styles.emoji} aria-hidden="true">🍜</span>
        <div className={styles.foodieBody}>
          <span className={styles.badge}>Free forever</span>
          <span className={styles.cardLabel}>I&apos;m a Foodie</span>
          <p className={styles.cardDesc}>
            Discover markets, follow vendors, and never miss what&apos;s on near you.
          </p>
          <span className={styles.cta}>Create free account →</span>
        </div>
      </Link>

      <div className={styles.row}>
        <Link href={ROUTES.SIGNUP_VENDOR} className={`${styles.card} ${styles.vendor}`}>
          <span className={styles.emoji} aria-hidden="true">🚚</span>
          <span className={styles.cardLabel}>I&apos;m a Vendor</span>
          <p className={styles.cardDesc}>
            List your food business, get discovered by event organisers, and manage bookings
            in one place.
          </p>
          <span className={styles.cta}>Create vendor account →</span>
        </Link>

        <Link href={ROUTES.SIGNUP_ORGANISER} className={`${styles.card} ${styles.organiser}`}>
          <span className={styles.emoji} aria-hidden="true">🎪</span>
          <span className={styles.cardLabel}>I&apos;m an Organiser</span>
          <p className={styles.cardDesc}>
            Post events, browse verified food vendors, and build the perfect market or
            festival lineup.
          </p>
          <span className={styles.cta}>Create organiser account →</span>
        </Link>
      </div>

      <p className={styles.footer}>
        Already have an account?{' '}
        <Link href={ROUTES.LOGIN} className={styles.loginLink}>
          Sign in
        </Link>
      </p>
    </div>
  )
}
