'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ROUTES } from '@/constants/routes'
import { NAVBAR_SCROLL_THRESHOLD_PX } from '@/constants/ui'
import styles from './Navbar.module.css'

const FOODIE_NAV_LINKS = [
  { href: ROUTES.DISCOVER, label: 'My Feed' },
  { href: ROUTES.EVENTS, label: 'All Events' },
  { href: ROUTES.VENDORS, label: 'Vendors' },
]

const DEFAULT_NAV_LINKS = [
  { href: ROUTES.EVENTS, label: 'Events' },
  { href: ROUTES.VENDORS, label: 'Vendors' },
  { href: ROUTES.HOW_IT_WORKS, label: 'How It Works' },
  { href: ROUTES.PRICING, label: 'Pricing' },
]

const MOBILE_MENU_ELEMENT_ID = 'mobile-menu'

function Navbar({ user }) {
  const router = useRouter()
  const currentPathname = usePathname()

  const [isNavbarScrolled, setIsNavbarScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)

  const isFoodieUser = user?.role === 'foodie'
  const desktopNavLinks = isFoodieUser ? FOODIE_NAV_LINKS : DEFAULT_NAV_LINKS

  const dashboardPath = isFoodieUser
    ? ROUTES.DISCOVER
    : user?.role === 'organiser'
      ? ROUTES.DASHBOARD_ORGANISER
      : user?.role === 'admin'
        ? ROUTES.ADMIN
        : ROUTES.DASHBOARD_VENDOR

  const dashboardLabel = isFoodieUser ? 'My Feed' : 'Dashboard'
  const firstName = user?.name?.split(' ')[0] || 'Account'

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

  useEffect(() => {
    if (!isMobileMenuOpen) return
    function handleDocumentClick(event) {
      const isInsideMenu = event.target.closest(`.${styles.mobileMenu}`)
      const isInsideHamburger = event.target.closest(`.${styles.hamburger}`)
      if (!isInsideMenu && !isInsideHamburger) setIsMobileMenuOpen(false)
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [isMobileMenuOpen])

  useEffect(() => {
    function handleDocumentKeyDown(event) {
      if (event.key !== 'Escape') return
      setIsMobileMenuOpen(false)
      setIsUserDropdownOpen(false)
    }
    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => document.removeEventListener('keydown', handleDocumentKeyDown)
  }, [])

  useEffect(() => {
    if (!isMobileMenuOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

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

  const handleSignOutButtonClick = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
    } catch (error) {
      console.error('[Navbar.handleSignOutButtonClick]', {
        message: error.message,
        endpoint: '/api/logout',
        timestamp: new Date().toISOString(),
      })
    }
    router.push(ROUTES.HOME)
    router.refresh()
  }, [router])

  return (
    <>
      <nav className={`${styles.navbar} ${isNavbarScrolled ? styles.scrolled : ''}`}>
        <Link href={ROUTES.HOME} className={styles.logo}>
          Pitch<span className={styles.dot}>.</span>
        </Link>

        <ul className={styles.links}>
          {desktopNavLinks.map(link => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={currentPathname === link.href ? styles.active : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {!user ? (
          <div className={styles.actions}>
            <Link href={ROUTES.LOGIN} className={styles.btnLogin}>Log in</Link>
            <Link href={ROUTES.SIGNUP} className={styles.btnCta}>Get Started</Link>
          </div>
        ) : isFoodieUser ? (
          <div className={styles.foodieActions}>
            <div className={styles.avatarBubble} aria-hidden="true">🍜</div>
            <span className={styles.avatarName}>{firstName}</span>
            <button
              type="button"
              className={styles.signOutButton}
              onClick={handleSignOutButtonClick}
            >
              Sign out
            </button>
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
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
          aria-controls={MOBILE_MENU_ELEMENT_ID}
        >
          <span /><span /><span />
        </button>
      </nav>

      <div
        id={MOBILE_MENU_ELEMENT_ID}
        className={`${styles.mobileMenu} ${isMobileMenuOpen ? styles.mobileMenuOpen : ''}`}
        aria-hidden={!isMobileMenuOpen}
      >
        {desktopNavLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            onClick={handleMobileLinkClick}
            className={currentPathname === link.href ? styles.active : undefined}
          >
            {link.label}
          </Link>
        ))}
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
          ) : isFoodieUser ? (
            <>
              <Link href={dashboardPath} className={styles.btnCta} onClick={handleMobileLinkClick}>
                {dashboardLabel}
              </Link>
              <button
                type="button"
                className={styles.btnLogin}
                onClick={() => {
                  handleMobileLinkClick()
                  handleSignOutButtonClick()
                }}
              >
                Log out
              </button>
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
