'use client'

import { memo } from 'react'
import Link from 'next/link'
import VendorCard from '@/components/VendorCard'
import { VENDORS_PER_PAGE } from '@/constants/limits'
import { ROUTES } from '@/constants/routes'
import styles from './VendorsGrid.module.css'

function VendorsGrid({ vendors = [], isLoading = false }) {
  if (isLoading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: VENDORS_PER_PAGE }, (_, index) => (
          <div key={index} className={styles.skeleton}>
            <div className={styles.skeletonHead}>
              <div className={styles.skeletonAvatar} />
              <div className={styles.skeletonHeadText}>
                <div className={styles.skeletonLine} style={{ width: '70%', height: 14 }} />
                <div className={styles.skeletonLine} style={{ width: '50%', height: 11 }} />
              </div>
            </div>
            <div className={styles.skeletonBody}>
              <div className={styles.skeletonLine} style={{ width: '45%', height: 12 }} />
              <div className={styles.skeletonLine} style={{ width: '60%', height: 11 }} />
              <div className={styles.skeletonTagsRow}>
                <div className={styles.skeletonTag} />
                <div className={styles.skeletonTag} />
                <div className={styles.skeletonTag} />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!vendors || vendors.length === 0) {
    return (
      <div className={styles.grid}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>{'\uD83D\uDD0D'}</div>
          <div className={styles.emptyTitle}>No vendors found</div>
          <div className={styles.emptyDescription}>
            Try adjusting your filters, or list your own vendor to be discovered by organisers.
          </div>
          <Link href={ROUTES.SIGNUP_VENDOR} className={styles.emptyCta}>
            List your vendor
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.grid}>
      {vendors.map((vendor) => (
        <VendorCard key={vendor.slug} vendor={vendor} />
      ))}
    </div>
  )
}

export default memo(VendorsGrid)
