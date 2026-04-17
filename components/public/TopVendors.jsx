'use client'

import { useMemo, memo } from 'react'
import Link from 'next/link'
import VendorCard from '@/components/VendorCard'
import { ROUTES } from '@/constants/routes'
import styles from './TopVendors.module.css'

const SKELETON_PLACEHOLDER_COUNT = 4

function TopVendors({ vendors = [], isLoading = false, error = null }) {
  if (isLoading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.section}>
          <div className={styles.header}>
            <div>
              <div className={styles.tag}>Featured Vendors</div>
              <h2 className={styles.title}>Top vendors on <em>Pitch.</em></h2>
            </div>
          </div>
          <div className={styles.marqueeOuter}>
            <div style={{ display: 'flex', gap: 20, padding: '0 16px' }}>
              {Array.from({ length: SKELETON_PLACEHOLDER_COUNT }, (_, index) => (
                <div key={index} style={{ width: 260, height: 200, background: 'var(--char, #231E19)', borderRadius: 12, opacity: 0.5, flexShrink: 0 }} />
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
              <div className={styles.tag}>Featured Vendors</div>
              <h2 className={styles.title}>Top vendors on <em>Pitch.</em></h2>
            </div>
          </div>
          <p style={{ color: 'var(--text-mid)', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
            Unable to load vendors. Refresh the page to try again.
          </p>
        </div>
      </div>
    )
  }

  if (!vendors || vendors.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.section}>
          <div className={styles.header}>
            <div>
              <div className={styles.tag}>Featured Vendors</div>
              <h2 className={styles.title}>Top vendors on <em>Pitch.</em></h2>
            </div>
          </div>
          <p style={{ color: 'var(--text-mid)', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
            No featured vendors yet.{' '}
            <Link href={ROUTES.SIGNUP_VENDOR} style={{ color: 'var(--ember)' }}>Join as a vendor &rarr;</Link>
          </p>
        </div>
      </div>
    )
  }

  // Duplicate vendor list for seamless marquee loop
  const marqueeVendors = useMemo(() => [...vendors, ...vendors], [vendors])

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.header}>
          <div>
            <div className={styles.tag}>Featured Vendors</div>
            <h2 className={styles.title}>Top vendors on <em>Pitch.</em></h2>
          </div>
          <Link href={ROUTES.VENDORS} className={styles.link}>Browse all vendors &rarr;</Link>
        </div>

        <div className={styles.marqueeOuter}>
          <div className={styles.marqueeWrap}>
            <div className={styles.marqueeTrack}>
              {marqueeVendors.map((vendor, vendorIndex) => (
                <VendorCard key={`${vendor.slug}-${vendorIndex}`} vendor={vendor} />
              ))}
            </div>
          </div>
          <div className={styles.rFade} />
        </div>
      </div>
    </div>
  )
}

export default memo(TopVendors)
