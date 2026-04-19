'use client'

import { memo } from 'react'
import { EVENT_CATEGORIES, EVENT_SORT_OPTIONS } from '@/constants/ui'
import styles from './FilterBar.module.css'

function toDisplayDate(iso) {
  if (!iso) return ''
  const parts = iso.split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function FilterBar({ filters, onFilterChange, onClearAll, onCalendarToggle, isCalendarOpen }) {
  const hasActiveFilters = filters.search || filters.category || filters.dateFrom || filters.dateTo || filters.sort !== 'soonest'

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
          placeholder="Search by name or suburb\u2026"
          value={filters.search}
          onChange={(inputEvent) => onFilterChange('search', inputEvent.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Category */}
      <select
        className={styles.select}
        value={filters.category}
        onChange={(changeEvent) => onFilterChange('category', changeEvent.target.value)}
      >
        {EVENT_CATEGORIES.map((category) => (
          <option key={category.value} value={category.value}>
            {category.label}
          </option>
        ))}
      </select>

      {/* Date range */}
      <div className={styles.dateRangeWrap}>
        <input
          className={`${styles.dateInput} ${filters.dateFrom ? styles.dateInputActive : ''}`}
          type="text"
          placeholder="Start date"
          value={toDisplayDate(filters.dateFrom)}
          readOnly
          onClick={onCalendarToggle}
        />
        <span className={styles.dateSep}>&rarr;</span>
        <input
          className={`${styles.dateInput} ${filters.dateTo ? styles.dateInputActive : ''}`}
          type="text"
          placeholder="End date"
          value={toDisplayDate(filters.dateTo)}
          readOnly
          onClick={onCalendarToggle}
        />
        <button
          type="button"
          className={`${styles.calToggleBtn} ${isCalendarOpen ? styles.calToggleBtnActive : ''}`}
          onClick={onCalendarToggle}
          title="Open calendar"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1.5" y="2.5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Sort */}
      <select
        className={styles.select}
        value={filters.sort}
        onChange={(changeEvent) => onFilterChange('sort', changeEvent.target.value)}
      >
        {EVENT_SORT_OPTIONS.map((sortOption) => (
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

export default memo(FilterBar)
