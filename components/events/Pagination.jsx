'use client'

import { memo } from 'react'
import styles from './Pagination.module.css'

function buildPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = [1]

  if (currentPage > 3) pages.push('...')

  const windowStart = Math.max(2, currentPage - 1)
  const windowEnd = Math.min(totalPages - 1, currentPage + 1)
  for (let pageNumber = windowStart; pageNumber <= windowEnd; pageNumber++) {
    pages.push(pageNumber)
  }

  if (currentPage < totalPages - 2) pages.push('...')

  pages.push(totalPages)
  return pages
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  const pageNumbers = buildPageNumbers(currentPage, totalPages)

  return (
    <div className={styles.pagination}>
      <button
        className={`${styles.button} ${styles.prev}`}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        &larr; Prev
      </button>

      {pageNumbers.map((page, index) => {
        if (page === '...') {
          return (
            <button key={`dots-${index}`} className={`${styles.button} ${styles.dots}`} disabled>
              &hellip;
            </button>
          )
        }

        return (
          <button
            key={page}
            className={`${styles.button} ${page === currentPage ? styles.active : ''}`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        )
      })}

      <button
        className={`${styles.button} ${styles.next}`}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next &rarr;
      </button>
    </div>
  )
}

export default memo(Pagination)
