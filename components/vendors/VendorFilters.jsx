'use client'

import { memo } from 'react'
import {
  VENDOR_CUISINES,
  VENDOR_SETUP_TYPES,
  VENDOR_SORT_OPTIONS,
} from '@/constants/ui'
import styles from './VendorFilters.module.css'

function VendorFilters({ filters, onFilterChange, onClearAll }) {
  const hasActiveFilters =
    filters.search
    || filters.cuisine
    || filters.setupType
    || filters.sort !== 'featured'

  return (
    <div className={styles.filterBar}>
      {/* Search */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className={`${styles.input} ${styles.searchInput}`}
          type="text"
          placeholder="Search by vendor name or cuisine\u2026"
          value={filters.search}
          onChange={(inputEvent) => onFilterChange('search', inputEvent.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Cuisine */}
      <select
        className={styles.select}
        value={filters.cuisine}
        onChange={(changeEvent) => onFilterChange('cuisine', changeEvent.target.value)}
      >
        {VENDOR_CUISINES.map((cuisine) => (
          <option key={cuisine.value} value={cuisine.value}>
            {cuisine.label}
          </option>
        ))}
      </select>

      {/* Setup type */}
      <select
        className={styles.select}
        value={filters.setupType}
        onChange={(changeEvent) => onFilterChange('setupType', changeEvent.target.value)}
      >
        {VENDOR_SETUP_TYPES.map((setupType) => (
          <option key={setupType.value} value={setupType.value}>
            {setupType.label}
          </option>
        ))}
      </select>

      {/* Sort */}
      <select
        className={styles.select}
        value={filters.sort}
        onChange={(changeEvent) => onFilterChange('sort', changeEvent.target.value)}
      >
        {VENDOR_SORT_OPTIONS.map((sortOption) => (
          <option key={sortOption.value} value={sortOption.value}>
            {sortOption.label}
          </option>
        ))}
      </select>

      {/* Clear all */}
      {hasActiveFilters && (
        <button type="button" className={styles.clearBtn} onClick={onClearAll}>
          Clear all
        </button>
      )}
    </div>
  )
}

export default memo(VendorFilters)
