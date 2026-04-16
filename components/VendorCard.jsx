import Link from 'next/link'
import styles from './VendorCard.module.css'

const PLAN_CLASS = {
  pro: styles.bdgPro,
  growth: styles.bdgGrowth,
  starter: styles.bdgBasic,
  basic: styles.bdgBasic,
}

export default function VendorCard({ vendor }) {
  const {
    slug, emoji, avatarGradient, name, verified, subtitle,
    plan, planLabel, rating, reviewCount, eventsCompleted, tags,
  } = vendor

  const stars = '\u2605'.repeat(Math.floor(rating || 0))
    + (rating % 1 >= 0.5 ? '\u2606' : '')
    + '\u2606'.repeat(5 - Math.ceil(rating || 0))

  const planCls = PLAN_CLASS[plan?.toLowerCase()] || styles.bdgBasic

  return (
    <Link href={`/vendors/${slug}`} className={styles.card}>
      <div className={styles.head}>
        <div className={styles.avatar} style={{ background: avatarGradient }}>
          {emoji}
        </div>
        <div className={styles.info}>
          <div className={styles.name}>
            {name}
            {verified && <span className={styles.verified}>{'\u2713'}</span>}
          </div>
          <div className={styles.sub}>{subtitle}</div>
        </div>
        <span className={`${styles.planBadge} ${planCls}`}>
          {planLabel || plan}
        </span>
      </div>

      <div className={styles.stars}>
        {stars} <span>{rating} &middot; {reviewCount} reviews</span>
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
