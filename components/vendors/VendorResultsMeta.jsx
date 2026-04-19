'use client'

import { memo } from 'react'
import styles from './VendorResultsMeta.module.css'

function VendorResultsMeta({ filteredCount, activeFilters = [], onRemoveFilter }) {
  return (
    <div className={styles.meta}>
      <div className={styles.left}>
        <div className={styles.count}>
          <strong>{filteredCount}</strong> vendor{filteredCount === 1 ? '' : 's'} found
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.filters}>
          {activeFilters.map((filter) => (
            <span key={filter.field} className={styles.chip}>
              {filter.label}
              <span
                className={styles.chipRemove}
                onClick={() => onRemoveFilter(filter.field)}
                role="button"
                tabIndex={0}
                aria-label={`Remove ${filter.label} filter`}
              >
                &times;
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(VendorResultsMeta)
