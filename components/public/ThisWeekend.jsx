'use client'

import { memo } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import styles from './ThisWeekend.module.css'

const CATEGORY_BORDER_COLORS = {
  'Night Market':    'var(--slate)',
  'Farmers Market':  'var(--herb)',
  'Festival':        'var(--gold)',
  'Twilight Market': 'var(--purple)',
  'Pop-up':          'var(--ember)',
  'Corporate':       'var(--slate)',
}

const SKELETON_PLACEHOLDER_COUNT = 3

function ThisWeekend({ events = [], isLoading = false, error = null }) {
  if (isLoading) {
    return (
      <div className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <div className={styles.liveDot} />
            <h2 className={styles.title}>This <em>weekend.</em></h2>
          </div>
          <div className={styles.scrollWrap}>
            <div className={styles.scroll}>
              {Array.from({ length: SKELETON_PLACEHOLDER_COUNT }, (_, index) => (
                <div key={index} className={styles.card} style={{ opacity: 0.3, pointerEvents: 'none' }}>
                  <div className={styles.cardBody}>
                    <div style={{ background: 'currentColor', opacity: 0.12, borderRadius: 4, width: 80, height: 12 }} />
                    <div style={{ background: 'currentColor', opacity: 0.12, borderRadius: 4, width: '75%', height: 16, marginTop: 10 }} />
                    <div style={{ background: 'currentColor', opacity: 0.12, borderRadius: 4, width: '55%', height: 12, marginTop: 8 }} />
                    <div style={{ background: 'currentColor', opacity: 0.12, borderRadius: 4, width: '40%', height: 12, marginTop: 8 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <h2 className={styles.title}>This <em>weekend.</em></h2>
          </div>
          <p style={{ color: 'var(--text-mid)', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
            Unable to load weekend events. Refresh the page to try again.
          </p>
        </div>
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <div className={styles.liveDot} />
            <h2 className={styles.title}>This <em>weekend.</em></h2>
          </div>
          <p style={{ color: 'var(--text-mid)', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
            No events coming up this weekend.{' '}
            <Link href={ROUTES.EVENTS} style={{ color: 'var(--ember)' }}>Browse all events &rarr;</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.liveDot} />
          <h2 className={styles.title}>This <em>weekend.</em></h2>
        </div>

        <div className={styles.scrollWrap}>
          <div className={styles.scroll}>
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className={styles.card}
                style={{ borderTopColor: CATEGORY_BORDER_COLORS[event.category] || 'var(--ember)' }}
              >
                <div className={styles.cardBody}>
                  <div className={styles.cardDay}>{event.dayLabel || event.category}</div>
                  <div className={styles.cardName}>{event.name}</div>
                  <div className={styles.cardWhere}>{event.suburb}, {event.state}</div>
                  <div className={styles.cardMeta}>{event.spotsLabel || (event.spots_left != null ? `${event.spots_left} spots left` : '\u2014')}</div>
                </div>
                <div className={styles.cardFoot}>
                  <span className={styles.apply}>View market &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(ThisWeekend)
