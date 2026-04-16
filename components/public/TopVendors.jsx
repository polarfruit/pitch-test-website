'use client'

import Link from 'next/link'
import VendorCard from '@/components/VendorCard'
import styles from './TopVendors.module.css'

export default function TopVendors({ vendors = [] }) {
  // Duplicate vendor list for seamless marquee loop
  const doubled = [...vendors, ...vendors]

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.header}>
          <div>
            <div className={styles.tag}>Featured Vendors</div>
            <h2 className={styles.title}>Top vendors on <em>Pitch.</em></h2>
          </div>
          <Link href="/vendors" className={styles.link}>Browse all vendors &rarr;</Link>
        </div>

        <div className={styles.marqueeOuter}>
          <div className={styles.marqueeWrap}>
            <div className={styles.marqueeTrack}>
              {doubled.map((v, i) => (
                <VendorCard key={`${v.slug}-${i}`} vendor={v} />
              ))}
            </div>
          </div>
          <div className={styles.rFade} />
        </div>
      </div>
    </div>
  )
}
