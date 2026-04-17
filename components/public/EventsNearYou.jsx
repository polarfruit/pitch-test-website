'use client'

import { memo } from 'react'
import Link from 'next/link'
import EventCard from '@/components/EventCard'
import { MAXIMUM_DISPLAYED_EVENTS } from '@/constants/limits'
import { ROUTES } from '@/constants/routes'
import styles from './EventsNearYou.module.css'

const CATEGORY_FALLBACK_PHOTOS = {
  'Night Market':    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=576&h=296&fit=crop&auto=format&q=80',
  'Farmers Market':  'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=576&h=296&fit=crop&auto=format&q=80',
  'Festival':        'https://images.unsplash.com/photo-1562802378-063ec186a863?w=576&h=296&fit=crop&auto=format&q=80',
  'Twilight Market': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=576&h=296&fit=crop&auto=format&q=80',
  'Pop-up':          'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=576&h=296&fit=crop&auto=format&q=80',
  'Corporate':       'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=576&h=296&fit=crop&auto=format&q=80',
}

const SKELETON_PLACEHOLDER_COUNT = 6

function EventsNearYou({ events = [], isLoading = false, error = null }) {
  if (isLoading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.section}>
          <div className={styles.header}>
            <div>
              <div className={styles.tag}>Browse Events</div>
              <h2 className={styles.title}>Events near you</h2>
            </div>
            <Link href={ROUTES.EVENTS} className={styles.link}>See all events &rarr;</Link>
          </div>
          <div className={styles.scrollWrap}>
            <div className={styles.scroll}>
              {Array.from({ length: SKELETON_PLACEHOLDER_COUNT }, (_, index) => (
                <div key={index} style={{ width: 288, height: 260, background: 'var(--char, #231E19)', borderRadius: 12, opacity: 0.5, flexShrink: 0 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.wrap}>
        <div className={styles.section}>
          <div className={styles.header}>
            <div>
              <div className={styles.tag}>Browse Events</div>
              <h2 className={styles.title}>Events near you</h2>
            </div>
          </div>
          <p style={{ color: 'var(--text-mid)', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
            Unable to load events. Refresh the page to try again.
          </p>
        </div>
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.section}>
          <div className={styles.header}>
            <div>
              <div className={styles.tag}>Browse Events</div>
              <h2 className={styles.title}>Events near you</h2>
            </div>
          </div>
          <p style={{ color: 'var(--text-mid)', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
            No events near you yet.{' '}
            <Link href={ROUTES.EVENTS} style={{ color: 'var(--ember)' }}>Browse all events &rarr;</Link>
          </p>
        </div>
      </div>
    )
  }

  const displayEvents = events.slice(0, MAXIMUM_DISPLAYED_EVENTS).map((event) => ({
    ...event,
    photo: event.photo || CATEGORY_FALLBACK_PHOTOS[event.category],
  }))

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.header}>
          <div>
            <div className={styles.tag}>Browse Events</div>
            <h2 className={styles.title}>Events near you</h2>
          </div>
          <Link href={ROUTES.EVENTS} className={styles.link}>See all events &rarr;</Link>
        </div>

        <div className={styles.scrollWrap}>
          <div className={styles.scroll}>
            {displayEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(EventsNearYou)
