'use client'

import { useEffect, useState } from 'react'
import styles from './LegalDocShell.module.css'

export default function LegalDocShell({ sections, children }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? null)
  const [isBackToTopVisible, setIsBackToTopVisible] = useState(false)
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false)

  useEffect(() => {
    function handleScroll() {
      const scrollPosition = window.scrollY + 120
      let currentActiveId = sections[0]?.id ?? null
      for (const section of sections) {
        const element = document.getElementById(section.id)
        if (element && element.offsetTop <= scrollPosition) {
          currentActiveId = section.id
        }
      }
      setActiveId(currentActiveId)
      setIsBackToTopVisible(window.scrollY > 400)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [sections])

  function handleBackToTopClick() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleTocLinkClick() {
    setIsMobileTocOpen(false)
  }

  return (
    <>
      <div className={styles.docLayout}>
        <nav className={styles.toc}>
          <button
            type="button"
            className={`${styles.tocMobileToggle} ${isMobileTocOpen ? styles.tocMobileToggleOpen : ''}`}
            onClick={() => setIsMobileTocOpen(previous => !previous)}
            aria-expanded={isMobileTocOpen}
          >
            Contents
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </button>
          <div className={styles.tocLabel}>Contents</div>
          <ul className={`${styles.tocList} ${isMobileTocOpen ? styles.tocListOpen : ''}`}>
            {sections.map(section => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={activeId === section.id ? styles.tocLinkActive : ''}
                  onClick={handleTocLinkClick}
                >
                  {section.tocLabel}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {children}
      </div>

      <button
        type="button"
        className={`${styles.backToTop} ${isBackToTopVisible ? styles.backToTopVisible : ''}`}
        onClick={handleBackToTopClick}
        aria-label="Back to top"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 13V3M3.5 7L8 2.5L12.5 7" />
        </svg>
      </button>
    </>
  )
}
