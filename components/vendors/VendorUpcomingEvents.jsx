import EventCard from '@/components/EventCard'
import styles from './VendorUpcomingEvents.module.css'

export default function VendorUpcomingEvents({ upcomingEvents }) {
  const hasUpcomingEvents =
    Array.isArray(upcomingEvents) && upcomingEvents.length > 0

  return (
    <section className={styles.upcoming} aria-labelledby="vendor-upcoming-heading">
      <h2 id="vendor-upcoming-heading" className={styles.heading}>
        Upcoming appearances
      </h2>

      {hasUpcomingEvents ? (
        <div className={styles.grid}>
          {upcomingEvents.map(upcomingEvent => (
            <EventCard key={upcomingEvent.id} event={upcomingEvent} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No upcoming events</p>
          <p className={styles.emptyBody}>
            This vendor has not been booked for any upcoming events yet.
          </p>
        </div>
      )}
    </section>
  )
}
