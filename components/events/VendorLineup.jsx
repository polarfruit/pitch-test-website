'use client'

import Link from 'next/link'
import styles from './VendorLineup.module.css'

function formatCuisineTags(rawValue) {
  if (!rawValue) return []
  if (Array.isArray(rawValue)) return rawValue.filter(Boolean)
  try {
    const parsed = JSON.parse(rawValue)
    if (Array.isArray(parsed)) return parsed.filter(Boolean)
  } catch {
    // fall through
  }
  return String(rawValue)
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
}

function VendorLineupCard({ vendor }) {
  const cuisineTags = formatCuisineTags(vendor.cuisine_tags).slice(0, 3)
  const initials = (vendor.trading_name ?? 'Vendor')
    .split(/\s+/)
    .map(word => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className={styles.card}>
      <div className={styles.avatar}>{initials}</div>
      <div className={styles.body}>
        <div className={styles.name}>{vendor.trading_name || 'Unnamed vendor'}</div>
        {cuisineTags.length > 0 && (
          <div className={styles.tagRow}>
            {cuisineTags.map(tag => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </div>
        )}
        {vendor.setup_type && (
          <div className={styles.setup}>{vendor.setup_type}</div>
        )}
      </div>
    </div>
  )
}

function VendorLineup({ vendors }) {
  if (!Array.isArray(vendors)) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Confirmed vendors</h2>
        <div className={styles.errorState}>Vendor lineup unavailable right now.</div>
      </section>
    )
  }

  if (vendors.length === 0) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Confirmed vendors</h2>
        <div className={styles.emptyState}>
          <div className={styles.emptyHeading}>No vendors confirmed yet</div>
          <p className={styles.emptyBody}>
            Be among the first to secure a spot at this event.
          </p>
          <Link href="/signup/vendor" className={styles.emptyAction}>
            Become a vendor
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>
        Confirmed vendors <span className={styles.count}>{vendors.length}</span>
      </h2>
      <div className={styles.grid}>
        {vendors.map(vendor => (
          <VendorLineupCard key={vendor.user_id} vendor={vendor} />
        ))}
      </div>
    </section>
  )
}

export default VendorLineup
