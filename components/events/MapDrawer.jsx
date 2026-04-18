'use client'

import Link from 'next/link'
import { CATEGORY_BADGE_COLORS } from '@/constants/ui'
import styles from './MapDrawer.module.css'

function formatEventDate(dateString) {
  if (!dateString) return 'TBC'
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatFeeRange(min, max) {
  if (!min || min <= 0) return 'Contact organiser'
  return `$${min}\u2013$${max}`
}

export default function MapDrawer({ event, isOpen, onClose }) {
  const drawerClassName = isOpen
    ? `${styles.drawer} ${styles.drawerOpen}`
    : styles.drawer

  const badgeColors = event
    ? CATEGORY_BADGE_COLORS[event.category] || {}
    : {}

  return (
    <div className={drawerClassName} aria-hidden={!isOpen}>
      <div className={styles.handle} />
      <button
        className={styles.closeButton}
        onClick={onClose}
        aria-label="Close event detail"
      >
        &times;
      </button>

      {event && (
        <>
          <div className={styles.eventName}>{event.name}</div>
          <span
            className={styles.categoryBadge}
            style={{
              background: badgeColors.background,
              color: badgeColors.color,
            }}
          >
            {event.category}
          </span>
          <div className={styles.meta}>
            {'\uD83D\uDCCD'} {event.suburb}, {event.state || 'SA'}
          </div>
          <div className={styles.meta}>
            {'\uD83D\uDCC5'} {formatEventDate(event.date_sort)}
          </div>
          <div className={styles.fee}>
            Booth fee: <strong>{formatFeeRange(event.stall_fee_min, event.stall_fee_max)}</strong>
          </div>
          <Link href={`/events/${event.slug}`} className={styles.viewLink}>
            View event <span>&rarr;</span>
          </Link>
        </>
      )}
    </div>
  )
}
