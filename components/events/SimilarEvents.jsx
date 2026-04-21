'use client'

import EventCard from '@/components/EventCard'
import styles from './SimilarEvents.module.css'

function SimilarEvents({ events }) {
  if (!Array.isArray(events) || events.length === 0) {
    return null
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Similar events nearby</h2>
      <div className={styles.grid}>
        {events.map(event => (
          <EventCard key={event.id ?? event.slug} event={event} />
        ))}
      </div>
    </section>
  )
}

export default SimilarEvents
