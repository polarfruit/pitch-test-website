'use client'

import { memo } from 'react'
import styles from './ResultsMeta.module.css'

function ResultsMeta({ filteredCount, totalCount, activeFilters = [], currentView, onViewChange, onRemoveFilter }) {
  return (
    <div className={styles.meta}>
      <div className={styles.left}>
        <div className={styles.count}>
          <strong>{filteredCount}</strong> event{filteredCount === 1 ? '' : 's'} found
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.filters}>
          {activeFilters.map((filter) => (
            <span key={filter} className={styles.chip}>
              {filter}
              <span
                className={styles.chipRemove}
                onClick={() => onRemoveFilter(filter)}
                role="button"
                tabIndex={0}
                aria-label={`Remove ${filter} filter`}
              >
                &times;
              </span>
            </span>
          ))}
        </div>

        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewButton} ${currentView === 'grid' ? styles.viewButtonActive : ''}`}
            onClick={() => onViewChange('grid')}
            title="List view"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="0" y="1" width="13" height="2" rx="1" fill="currentColor" />
              <rect x="0" y="5.5" width="13" height="2" rx="1" fill="currentColor" />
              <rect x="0" y="10" width="13" height="2" rx="1" fill="currentColor" />
            </svg>
            List
          </button>
          <button
            className={`${styles.viewButton} ${currentView === 'map' ? styles.viewButtonActive : ''}`}
            onClick={() => onViewChange('map')}
            title="Map view"
          >
            <svg width="13" height="15" viewBox="0 0 13 15" fill="none">
              <path d="M6.5 0C4.01 0 2 2.01 2 4.5C2 7.88 6.5 14 6.5 14C6.5 14 11 7.88 11 4.5C11 2.01 8.99 0 6.5 0ZM6.5 6C5.67 6 5 5.33 5 4.5C5 3.67 5.67 3 6.5 3C7.33 3 8 3.67 8 4.5C8 5.33 7.33 6 6.5 6Z" fill="currentColor" />
            </svg>
            Map
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(ResultsMeta)
