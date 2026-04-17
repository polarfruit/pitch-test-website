import { memo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { FILL_RATE_CRITICAL_THRESHOLD, FILL_RATE_WARNING_THRESHOLD } from '@/constants/thresholds'
import { CATEGORY_BADGE_COLORS } from '@/constants/ui'
import styles from './EventCard.module.css'

const CATEGORY_IMAGE_CLASS = {
  'Night Market':    styles.imgNight,
  'Farmers Market':  styles.imgFarm,
  'Festival':        styles.imgFest,
  'Twilight Market': styles.imgTwi,
  'Pop-up':          styles.imgPort,
  'Corporate':       styles.imgBarossa,
}

const CRITICAL_PERCENT = FILL_RATE_CRITICAL_THRESHOLD * 100
const WARNING_PERCENT = FILL_RATE_WARNING_THRESHOLD * 100

function getFillBarColor(fillPercent) {
  if (fillPercent >= CRITICAL_PERCENT) return '#C0392B'
  if (fillPercent >= WARNING_PERCENT) return '#C9840A'
  return '#2D8B55'
}

function getSpotsBadgeStyle(fillPercent) {
  if (fillPercent >= CRITICAL_PERCENT) return { background: 'rgba(192,57,43,0.08)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.16)' }
  if (fillPercent >= WARNING_PERCENT) return { background: 'rgba(201,132,10,0.08)', color: '#C9840A', border: '1px solid rgba(201,132,10,0.16)' }
  return { background: 'rgba(45,139,85,0.08)', color: '#2D8B55', border: '1px solid rgba(45,139,85,0.16)' }
}

const CATEGORY_BADGE_FALLBACK = { background: 'rgba(107,90,74,0.08)', color: '#6B5A4A' }

function EventCard({ event }) {
  if (!event) return null

  const { id, name, category, suburb, state, dateLabel, filled, total, feeMin, feeMax, deadlineLabel, photo, spots_left, spots_total } = event
  const totalSpots = total ?? spots_total ?? 0
  const filledSpots = filled ?? (totalSpots - (spots_left ?? totalSpots))
  const fillPercent = totalSpots > 0 ? Math.round((filledSpots / totalSpots) * 100) : 0
  const spotsRemaining = spots_left ?? (totalSpots - filledSpots)
  const minimumFee = feeMin ?? event.fee_min
  const maximumFee = feeMax ?? event.fee_max
  const categoryColor = CATEGORY_BADGE_COLORS[category] || CATEGORY_BADGE_FALLBACK
  const categoryImageClass = CATEGORY_IMAGE_CLASS[category] || styles.imgNight
  const fillBarColor = getFillBarColor(fillPercent)
  const spotsBadgeStyle = getSpotsBadgeStyle(fillPercent)

  return (
    <Link href={`/events/${id}`} className={styles.card}>
      <div className={`${styles.img} ${categoryImageClass}`}>
        {photo && (
          <Image src={photo} alt={category} className={styles.photo} fill sizes="(max-width: 640px) 100vw, 288px" />
        )}
        <div className={styles.overlay} />
        <span className={styles.catBadge} style={{ background: categoryColor.background, color: categoryColor.color }}>
          {category}
        </span>
        <span className={styles.spotsBadge} style={spotsBadgeStyle}>
          {spotsRemaining} spot{spotsRemaining === 1 ? '' : 's'} left
        </span>
      </div>
      <div className={styles.body}>
        <div className={styles.name}>{name}</div>
        <div className={styles.meta}>{'\u{1F4CD}'} {suburb}, {state}</div>
        <div className={styles.meta}>{'\u{1F4C5}'} {dateLabel}</div>
        <div className={styles.fillLabel}>
          <span>{filledSpots}/{totalSpots} spots filled</span>
          <span style={{ color: fillBarColor, fontWeight: 700 }}>{fillPercent}%</span>
        </div>
        <div className={styles.fillBg}>
          <div className={styles.fillInner} style={{ width: `${fillPercent}%`, background: fillBarColor }} />
        </div>
        <div className={styles.footerRow}>
          <div className={styles.price}>Booth: <strong>${minimumFee}&ndash;${maximumFee}</strong></div>
          <div className={styles.deadline}>Deadline: {deadlineLabel}</div>
        </div>
      </div>
    </Link>
  )
}

export default memo(EventCard)
