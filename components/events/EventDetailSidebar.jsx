'use client'

import Link from 'next/link'
import { FILL_RING_RADIUS_PX, FILL_RING_CIRCUMFERENCE_PX } from '@/constants/limits'
import { FILL_RATE_CRITICAL_THRESHOLD, FILL_RATE_WARNING_THRESHOLD } from '@/constants/thresholds'
import styles from './EventDetailSidebar.module.css'

const RING_SIZE_PX = 140
const RING_CENTER_PX = 70

function getRingColor(fillPercent) {
  if (fillPercent >= FILL_RATE_CRITICAL_THRESHOLD * 100) return '#C0392B'
  if (fillPercent >= FILL_RATE_WARNING_THRESHOLD * 100) return '#C9840A'
  return '#2D8B55'
}

function OrganiserInitials({ name }) {
  const initials = (name || 'OR')
    .split(/\s+/)
    .map(word => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return initials
}

function EventDetailSidebar({ event, deadlineLabel, applyState, onApplyClick }) {
  const approvedCount = Number(event.approved_count ?? 0)
  const totalSpots = Number(event.stalls_available ?? 0)
  const spotsRemaining = Math.max(0, totalSpots - approvedCount)
  const fillPercent = totalSpots > 0 ? Math.round((approvedCount / totalSpots) * 100) : 0
  const ringColor = getRingColor(fillPercent)
  const ringFillLength = (fillPercent / 100) * FILL_RING_CIRCUMFERENCE_PX

  return (
    <aside className={styles.sidebar}>
      <div className={styles.card}>
        <div className={styles.ringWrap}>
          <svg width={RING_SIZE_PX} height={RING_SIZE_PX} viewBox={`0 0 ${RING_SIZE_PX} ${RING_SIZE_PX}`} aria-hidden="true">
            <circle
              cx={RING_CENTER_PX}
              cy={RING_CENTER_PX}
              r={FILL_RING_RADIUS_PX}
              fill="none"
              stroke="var(--ash, #2E2720)"
              strokeWidth="10"
            />
            <circle
              cx={RING_CENTER_PX}
              cy={RING_CENTER_PX}
              r={FILL_RING_RADIUS_PX}
              fill="none"
              stroke={ringColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${ringFillLength} ${FILL_RING_CIRCUMFERENCE_PX}`}
              transform={`rotate(-90 ${RING_CENTER_PX} ${RING_CENTER_PX})`}
              style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
            <text x={RING_CENTER_PX} y={RING_CENTER_PX - 4} textAnchor="middle" dominantBaseline="middle" className={styles.ringLabel}>
              {fillPercent}%
            </text>
            <text x={RING_CENTER_PX} y={RING_CENTER_PX + 16} textAnchor="middle" dominantBaseline="middle" className={styles.ringSub}>
              filled
            </text>
          </svg>
          <div className={styles.caption}>
            {approvedCount} of {totalSpots || '?'} spots filled{' '}
            {totalSpots > 0 && (
              <>— <strong>{spotsRemaining} remaining</strong></>
            )}
          </div>
        </div>

        <div className={styles.deadlineRow}>
          <div>
            <div className={styles.deadlineLabel}>Application deadline</div>
            <div className={styles.deadlineVal}>{deadlineLabel}</div>
          </div>
        </div>

        <div className={styles.organiserRow}>
          <div className={styles.orgAvatar}>
            <OrganiserInitials name={event.organiser_name} />
          </div>
          <div className={styles.orgText}>
            <div className={styles.orgNameRow}>
              <div className={styles.orgName}>{event.organiser_name || 'Organiser'}</div>
              {event.organiser_verified && (
                <span className={styles.orgVerified}>✓ Verified</span>
              )}
            </div>
            <div className={styles.orgMeta}>
              {event.org_event_count ?? 0} event{event.org_event_count === 1 ? '' : 's'} hosted
            </div>
          </div>
        </div>
      </div>

      {applyState.kind !== 'hidden' && (
        <div className={styles.ctaStack}>
          {applyState.kind === 'primary' && (
            <button type="button" className={styles.applyBtn} onClick={onApplyClick}>
              {applyState.label}
            </button>
          )}
          {applyState.kind === 'link' && (
            <Link href={applyState.href} className={styles.applyBtn}>
              {applyState.label}
            </Link>
          )}
          {applyState.kind === 'submitted' && (
            <button type="button" className={`${styles.applyBtn} ${styles.applyBtnSubmitted}`} disabled>
              {applyState.label}
            </button>
          )}
          {applyState.kind === 'disabled' && (
            <button type="button" className={`${styles.applyBtn} ${styles.applyBtnDisabled}`} disabled>
              {applyState.label}
            </button>
          )}
        </div>
      )}

      <div className={styles.trustNote}>
        <span className={styles.trustIcon}>✓</span>
        <span>All vendors on Pitch are ABN verified, food-safety certified, and carry $10M public liability insurance.</span>
      </div>
    </aside>
  )
}

export default EventDetailSidebar
