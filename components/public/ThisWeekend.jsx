'use client'

import Link from 'next/link'
import styles from './ThisWeekend.module.css'

const CAT_BORDERS = {
  'Night Market': '#2B5BA8',
  'Farmers Market': '#2D8B55',
  'Festival': '#C9840A',
  'Twilight Market': '#7C3AED',
  'Pop-up': '#E8500A',
}

export default function ThisWeekend({ events = [] }) {
  if (!events.length) return null

  return (
    <div className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.liveDot} />
          <h2 className={styles.title}>Coming <em>up.</em></h2>
        </div>

        <div className={styles.scrollWrap}>
          <div className={styles.scroll}>
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className={styles.card}
                style={{ borderTopColor: CAT_BORDERS[ev.category] || 'var(--ember)' }}
              >
                <div className={styles.cardBody}>
                  <div className={styles.cardDay}>{ev.dayLabel || ev.category}</div>
                  <div className={styles.cardName}>{ev.name}</div>
                  <div className={styles.cardWhere}>{ev.suburb}, {ev.state}</div>
                  <div className={styles.cardMeta}>{ev.spotsLabel || (ev.spots_left != null ? `${ev.spots_left} spots left` : '\u2014')}</div>
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
