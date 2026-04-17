import { memo } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import styles from './HowItWorks.module.css'

const VENDOR_STEPS = [
  { num: '1', title: 'Create your profile', desc: 'Photos, cuisine tags, certifications — build a profile that wins bookings.' },
  { num: '2', title: 'Get verified', desc: 'ABN, food safety cert, public liability. Verified vendors rank higher.' },
  { num: '3', title: 'Apply & get confirmed', desc: 'Browse events, one-click apply, and hear back within 48 hours — guaranteed.' },
]

const ORGANISER_STEPS = [
  { num: '1', title: 'Post your event', desc: 'Dates, location, stall specs, fees. Live in under 5 minutes.' },
  { num: '2', title: 'Review applications', desc: 'Verified vendors apply. View profiles, certs, and past events in one place.' },
  { num: '3', title: 'Approve your lineup', desc: 'One-click approve. Vendors are notified instantly. Your roster is ready.' },
]

function StepColumn({ label, steps }) {
  return (
    <div>
      <div className={styles.colHead}>{label}</div>
      <div className={styles.steps}>
        {steps.map((step, stepIndex) => (
          <div key={step.num}>
            <div className={styles.step}>
              <div className={styles.num}>{step.num}</div>
              <div className={styles.stepBody}>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepDesc}>{step.desc}</div>
              </div>
            </div>
            {stepIndex < steps.length - 1 && <div className={styles.connector} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function HowItWorks() {
  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.tag}>How It Works</div>
        <h2 className={styles.title}>Your pitch, <em>simplified.</em></h2>
        <p className={styles.desc}>
          Whether you&apos;re a vendor chasing your next gig or an organiser building a lineup — Pitch handles the matchmaking.
        </p>

        <div className={styles.grid}>
          <StepColumn label="For vendors" steps={VENDOR_STEPS} />
          <div className={styles.divider} />
          <StepColumn label="For organisers" steps={ORGANISER_STEPS} />
        </div>

        <div className={styles.ctaWrap}>
          <Link href={ROUTES.HOW_IT_WORKS} className={styles.cta}>
            See the full breakdown <span>&rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default memo(HowItWorks)
