'use client'

import { useState } from 'react'
import styles from './HeroSection.module.css'

function HeroSearchDropdown({ label, options, value, onChange }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value) || options[0]
  return (
    <div className={`${styles.seg} ${styles.segSel}`} onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
      <span className={styles.label}>{label}</span>
      <div className={styles.csel}>
        <span className={`${styles.cselVal} ${!value ? styles.placeholder : ''}`}>
          {selectedOption.label}
        </span>
        <span className={styles.selArrow}>&#9662;</span>
        {isDropdownOpen && (
          <div className={styles.cselDrop}>
            {options.map((option) => (
              <div
                key={option.value}
                className={`${styles.cselOpt} ${option.value === value ? styles.selected : ''}`}
                onClick={(clickEvent) => { clickEvent.stopPropagation(); onChange(option.value); setIsDropdownOpen(false) }}
              >
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default HeroSearchDropdown
