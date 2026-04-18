'use client'

import { memo } from 'react'
import EventCard from '@/components/EventCard'
import { EVENTS_PER_PAGE } from '@/constants/limits'
import styles from './EventsGrid.module.css'

function EventsGrid({ events = [], isLoading = false }) {
  if (isLoading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: EVENTS_PER_PAGE }, (_, index) => (
          <div key={index} className={styles.skeleton}>
            <div className={styles.skeletonImage} />
            <div className={styles.skeletonBody}>
              <div className={styles.skeletonLine} style={{ width: '75%', height: 16 }} />
              <div className={styles.skeletonLine} style={{ width: '55%', height: 12 }} />
              <div className={styles.skeletonLine} style={{ width: '40%', height: 12 }} />
              <div className={styles.skeletonLine} style={{ width: '100%', height: 8, marginTop: 8 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className={styles.grid}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>{'\uD83D\uDD0D'}</div>
          <div className={styles.emptyTitle}>No events found</div>
          <div className={styles.emptyDescription}>
            Try adjusting your filters or clearing all filters.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.grid}>
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  )
}

export default memo(EventsGrid)
