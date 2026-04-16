import Link from 'next/link'
import styles from './CategoryBrowse.module.css'

const CATEGORIES = [
  { emoji: '\uD83C\uDF19', name: 'Night Markets', key: 'Night Market' },
  { emoji: '\uD83C\uDFAA', name: 'Festivals', key: 'Festival' },
  { emoji: '\uD83C\uDF3E', name: 'Farmers Markets', key: 'Farmers Market' },
  { emoji: '\uD83C\uDFE2', name: 'Corporate Events', key: 'Corporate' },
  { emoji: '\u26A1', name: 'Pop-ups', key: 'Pop-up' },
  { emoji: '\uD83C\uDF05', name: 'Twilight Markets', key: 'Twilight Market' },
]

const FALLBACK_COUNTS = {
  'Night Market': 12, 'Festival': 8, 'Farmers Market': 15,
  'Corporate': 6, 'Pop-up': 22, 'Twilight Market': 9,
}

export default function CategoryBrowse({ categories = {} }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.tag}>Categories</div>
        <h2 className={styles.title}>Find your <em>category.</em></h2>
        <p className={styles.desc}>
          Browse events by type — from weekly night markets to one-off festivals and corporate catering gigs.
        </p>

        <div className={styles.grid}>
          {CATEGORIES.map((cat) => {
            const count = categories[cat.key] || FALLBACK_COUNTS[cat.key] || 0
            return (
              <Link
                key={cat.key}
                href={`/events?category=${encodeURIComponent(cat.key)}`}
                className={styles.tile}
              >
                <div className={styles.emoji}>{cat.emoji}</div>
                <div className={styles.catName}>{cat.name}</div>
                <div className={styles.count}>
                  {count} active event{count === 1 ? '' : 's'}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
