import { memo } from 'react'
import Link from 'next/link'
import { MAX_STAR_RATING } from '@/constants/limits'
import styles from './VendorCard.module.css'

const PLAN_BADGE_CLASS = {
  pro: styles.bdgPro,
  growth: styles.bdgGrowth,
  starter: styles.bdgBasic,
  basic: styles.bdgBasic,
}

function VendorCard({ vendor }) {
  if (!vendor) return null

  const {
    slug, emoji, avatarGradient, name, verified: isVendorVerified, subtitle,
    plan, planLabel, rating, reviewCount, eventsCompleted, tags,
  } = vendor

  const starRatingDisplay = '\u2605'.repeat(Math.floor(rating || 0))
    + (rating % 1 >= 0.5 ? '\u2606' : '')
    + '\u2606'.repeat(MAX_STAR_RATING - Math.ceil(rating || 0))

  const planBadgeClass = PLAN_BADGE_CLASS[plan?.toLowerCase()] || styles.bdgBasic

  return (
    <Link href={`/vendors/${slug}`} className={styles.card}>
      <div className={styles.head}>
        <div className={styles.avatar} style={{ background: avatarGradient }}>
          {emoji}
        </div>
        <div className={styles.info}>
          <div className={styles.name}>
            {name}
            {isVendorVerified && <span className={styles.verified}>{'\u2713'}</span>}
          </div>
          <div className={styles.sub}>{subtitle}</div>
        </div>
        <span className={`${styles.planBadge} ${planBadgeClass}`}>
          {planLabel || plan}
        </span>
      </div>

      <div className={styles.stars}>
        {starRatingDisplay} <span>{rating} &middot; {reviewCount} reviews</span>
      </div>
      <div className={styles.events}>{eventsCompleted} events completed</div>

      {tags && tags.length > 0 && (
        <div className={styles.tags}>
          {tags.map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
        </div>
      )}
    </Link>
  )
}

export default memo(VendorCard)
