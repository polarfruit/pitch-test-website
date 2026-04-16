'use client'

import Link from 'next/link'
import EventCard from '@/components/EventCard'
import styles from './EventsNearYou.module.css'

const CAT_PHOTO = {
  'Night Market':    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=576&h=296&fit=crop&auto=format&q=80',
  'Farmers Market':  'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=576&h=296&fit=crop&auto=format&q=80',
  'Festival':        'https://images.unsplash.com/photo-1562802378-063ec186a863?w=576&h=296&fit=crop&auto=format&q=80',
  'Twilight Market': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=576&h=296&fit=crop&auto=format&q=80',
  'Pop-up':          'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=576&h=296&fit=crop&auto=format&q=80',
  'Corporate':       'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=576&h=296&fit=crop&auto=format&q=80',
}

export default function EventsNearYou({ events = [] }) {
  const displayEvents = events.slice(0, 6).map((ev) => ({
    ...ev,
    photo: ev.photo || CAT_PHOTO[ev.category],
  }))

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.header}>
          <div>
            <div className={styles.tag}>Browse Events</div>
            <h2 className={styles.title}>Events near you</h2>
          </div>
          <Link href="/events" className={styles.link}>See all events &rarr;</Link>
        </div>

        <div className={styles.scrollWrap}>
          <div className={styles.scroll}>
            {displayEvents.map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
