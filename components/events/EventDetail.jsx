'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CATEGORY_BADGE_COLORS } from '@/constants/ui'
import EventDetailSidebar from './EventDetailSidebar'
import ApplyModal from './ApplyModal'
import VendorLineup from './VendorLineup'
import SimilarEvents from './SimilarEvents'
import { formatEventDate, formatDeadlineDate } from '@/lib/utils/eventFormatters'
import { deriveApplyState, deriveEventStatus } from '@/lib/utils/eventStatus'
import styles from './EventDetail.module.css'

function EventDetail({ event, user, similarEvents }) {
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false)
  const [hasAppliedThisSession, setHasAppliedThisSession] = useState(false)

  if (!event) return null

  const status = deriveEventStatus(event)
  const applyState = deriveApplyState({ event, user, status, hasAppliedThisSession })

  const categoryColor =
    CATEGORY_BADGE_COLORS[event.category] ??
    { background: 'rgba(107,90,74,0.08)', color: '#6B5A4A' }

  const dateLabel = formatEventDate(event.date_text ?? event.date_sort) || '—'
  const deadlineLabel = formatDeadlineDate(event.deadline) || '—'
  const locationLabel = [event.venue_name, event.suburb, event.state].filter(Boolean).join(', ') || '—'
  const feeLabel = event.stall_fee_min && event.stall_fee_max
    ? `$${event.stall_fee_min} – $${event.stall_fee_max}`
    : event.stall_fee_min
      ? `$${event.stall_fee_min}`
      : '—'

  const mapsQuery = encodeURIComponent(
    [event.venue_name, event.suburb, event.state, 'Australia'].filter(Boolean).join(', ')
  )

  return (
    <>
      <div className={styles.page}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className={styles.sep}>›</span>
          <Link href="/events">Events</Link>
          <span className={styles.sep}>›</span>
          <span>{event.name}</span>
        </nav>

        <div className={styles.wrap}>
          <div className={styles.main}>
            {status.banner && (
              <div
                className={styles.statusBanner}
                data-tone={status.banner.tone}
                role="status"
              >
                <strong>{status.banner.title}</strong>
                <span>{status.banner.description}</span>
              </div>
            )}

            <div className={styles.hero}>
              <div className={styles.heroOverlay} />
              <span
                className={styles.heroBadge}
                style={{ background: categoryColor.background, color: categoryColor.color }}
              >
                {event.category}
              </span>
              <div className={styles.heroMeta}>
                <span>{'\u{1F4CD}'} {event.suburb}, {event.state}</span>
                <span>{'\u{1F4C5}'} {dateLabel}</span>
              </div>
            </div>

            <h1 className={styles.title}>{event.name}</h1>

            <div className={styles.metaRow}>
              <span className={styles.metaBadge}>{event.category}</span>
              <span className={styles.metaBadge}>{event.suburb}, {event.state}</span>
              <span className={styles.metaBadge}>{dateLabel}</span>
            </div>

            <div className={styles.divider} />

            <h2 className={styles.subsecTitle}>About this event</h2>
            <p className={styles.about}>
              {event.description || 'No description provided yet. Contact the organiser for more detail.'}
            </p>

            <div className={styles.divider} />

            <h2 className={styles.subsecTitle}>Event specifications</h2>
            <div className={styles.specs}>
              <SpecItem label="Date" value={dateLabel} />
              <SpecItem label="Location" value={locationLabel} />
              <SpecItem label="Total vendor spots" value={event.stalls_available ? `${event.stalls_available} spots` : '—'} />
              <SpecItem label="Approved vendors" value={`${event.approved_count ?? 0}`} />
            </div>

            <div className={styles.divider} />

            <h2 className={styles.subsecTitle}>Booth fee</h2>
            <div className={styles.feeBox}>
              <div>
                <div className={styles.feeLabel}>Fee range</div>
                <div className={styles.feeRange}>{feeLabel}</div>
                <div className={styles.feeNote}>Varies by booth size — GST inclusive</div>
              </div>
            </div>

            <div className={styles.divider} />

            <h2 className={styles.subsecTitle}>Location</h2>
            <p className={styles.addressLine}>{locationLabel}</p>
            <div className={styles.mapActions}>
              <a className={styles.mapAction} href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noopener noreferrer">Google Maps</a>
              <a className={styles.mapAction} href={`https://maps.apple.com/?q=${mapsQuery}`} target="_blank" rel="noopener noreferrer">Apple Maps</a>
            </div>

            <div className={styles.divider} />

            <VendorLineup vendors={event.approved_vendors} />

            <div className={styles.divider} />

            <SimilarEvents events={similarEvents} />
          </div>

          <EventDetailSidebar
            event={event}
            deadlineLabel={deadlineLabel}
            applyState={applyState}
            onApplyClick={() => setIsApplyModalOpen(true)}
          />
        </div>
      </div>

      {isApplyModalOpen && (
        <ApplyModal
          event={event}
          onClose={() => setIsApplyModalOpen(false)}
          onSubmitted={() => setHasAppliedThisSession(true)}
        />
      )}
    </>
  )
}

function SpecItem({ label, value }) {
  return (
    <div className={styles.specItem}>
      <div className={styles.specLabel}>{label}</div>
      <div className={styles.specValue}>{value}</div>
    </div>
  )
}

export default EventDetail
