'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { NAVBAR_SCROLL_THRESHOLD_PX } from '@/constants/ui'
import styles from './Navbar.module.css'

function Navbar({ user }) {
  const [isNavbarScrolled, setIsNavbarScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)

  useEffect(() => {
    function handleWindowScroll() {
      setIsNavbarScrolled(window.scrollY > NAVBAR_SCROLL_THRESHOLD_PX)
    }
    handleWindowScroll()
    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleWindowScroll)
  }, [])

  useEffect(() => {
    if (!isUserDropdownOpen) return
    function handleDocumentClick(event) {
      if (!event.target.closest(`.${styles.navUser}`)) setIsUserDropdownOpen(false)
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [isUserDropdownOpen])

  const dashboardPath = user?.role === 'organiser'
    ? ROUTES.DASHBOARD_ORGANISER
    : user?.role === 'admin'
      ? ROUTES.ADMIN
      : ROUTES.DASHBOARD_VENDOR

  const firstName = user?.name?.split(' ')[0] || 'Account'

  const handleUserNameButtonClick = useCallback(() => {
    setIsUserDropdownOpen(previous => !previous)
  }, [])

  const handleHamburgerButtonClick = useCallback(() => {
    setIsMobileMenuOpen(previous => !previous)
  }, [])

  const handleDropdownLinkClick = useCallback(() => {
    setIsUserDropdownOpen(false)
  }, [])

  const handleMobileLinkClick = useCallback(() => {
    setIsMobileMenuOpen(false)
  }, [])

  return (
    <>
      <nav className={`${styles.navbar} ${isNavbarScrolled ? styles.scrolled : ''}`}>
        <Link href={ROUTES.HOME} className={styles.logo}>
          Pitch<span className={styles.dot}>.</span>
        </Link>

        <ul className={styles.links}>
          <li><Link href={ROUTES.EVENTS}>Events</Link></li>
          <li><Link href={ROUTES.VENDORS}>Vendors</Link></li>
          <li><Link href={ROUTES.HOW_IT_WORKS}>How It Works</Link></li>
          <li><Link href={ROUTES.PRICING}>Pricing</Link></li>
        </ul>

        {!user ? (
          <div className={styles.actions}>
            <Link href={ROUTES.LOGIN} className={styles.btnLogin}>Log in</Link>
            <Link href={ROUTES.SIGNUP} className={styles.btnCta}>Get Started</Link>
          </div>
        ) : (
          <div className={styles.navUser}>
            <button
              className={styles.userName}
              onClick={handleUserNameButtonClick}
              type="button"
            >
              <span>{firstName}</span>
              <span className={styles.chevron}>&#9662;</span>
            </button>
            {isUserDropdownOpen && (
              <div className={styles.dropdown}>
                <Link href={dashboardPath} onClick={handleDropdownLinkClick}>
                  Dashboard
                </Link>
                <div className={styles.divider} />
                <Link
                  href={ROUTES.LOGOUT}
                  className={styles.danger}
                  onClick={handleDropdownLinkClick}
                >
                  Log out
                </Link>
              </div>
            )}
          </div>
        )}

        <button
          className={styles.hamburger}
          onClick={handleHamburgerButtonClick}
          aria-label="Menu"
          type="button"
        >
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile menu */}
      <div className={`${styles.mobileMenu} ${isMobileMenuOpen ? styles.mobileMenuOpen : ''}`}>
        <Link href={ROUTES.EVENTS} onClick={handleMobileLinkClick}>Events</Link>
        <Link href={ROUTES.VENDORS} onClick={handleMobileLinkClick}>Vendors</Link>
        <Link href={ROUTES.HOW_IT_WORKS} onClick={handleMobileLinkClick}>How It Works</Link>
        <div className={styles.mobileActions}>
          {!user ? (
            <>
              <Link href={ROUTES.LOGIN} className={styles.btnLogin} onClick={handleMobileLinkClick}>
                Log in
              </Link>
              <Link href={ROUTES.SIGNUP} className={styles.btnCta} onClick={handleMobileLinkClick}>
                Get Started
              </Link>
            </>
          ) : (
            <>
              <Link href={dashboardPath} className={styles.btnCta} onClick={handleMobileLinkClick}>
                Dashboard
              </Link>
              <Link href={ROUTES.LOGOUT} className={styles.btnLogin} onClick={handleMobileLinkClick}>
                Log out
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default memo(Navbar)
