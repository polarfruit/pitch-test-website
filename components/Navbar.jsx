'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import styles from './Navbar.module.css'

export default function Navbar({ user }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!dropdownOpen) return
    function close(e) {
      if (!e.target.closest(`.${styles.navUser}`)) setDropdownOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [dropdownOpen])

  const dashHref = user?.role === 'organiser'
    ? '/dashboard/organiser'
    : user?.role === 'admin'
      ? '/admin'
      : '/dashboard/vendor'

  const firstName = user?.name?.split(' ')[0] || 'Account'

  return (
    <>
      <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}>
        <Link href="/" className={styles.logo}>
          Pitch<span className={styles.dot}>.</span>
        </Link>

        <ul className={styles.links}>
          <li><Link href="/events">Events</Link></li>
          <li><Link href="/vendors">Vendors</Link></li>
          <li><Link href="/how-it-works">How It Works</Link></li>
          <li><Link href="/pricing">Pricing</Link></li>
        </ul>

        {!user ? (
          <div className={styles.actions}>
            <Link href="/login" className={styles.btnLogin}>Log in</Link>
            <Link href="/signup" className={styles.btnCta}>Get Started</Link>
          </div>
        ) : (
          <div className={styles.navUser}>
            <button
              className={styles.userName}
              onClick={() => setDropdownOpen(!dropdownOpen)}
              type="button"
            >
              <span>{firstName}</span>
              <span className={styles.chevron}>&#9662;</span>
            </button>
            {dropdownOpen && (
              <div className={styles.dropdown}>
                <Link href={dashHref} onClick={() => setDropdownOpen(false)}>
                  Dashboard
                </Link>
                <div className={styles.divider} />
                <Link
                  href="/logout"
                  className={styles.danger}
                  onClick={() => setDropdownOpen(false)}
                >
                  Log out
                </Link>
              </div>
            )}
          </div>
        )}

        <button
          className={styles.hamburger}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
          type="button"
        >
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile menu */}
      <div className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}>
        <Link href="/events" onClick={() => setMenuOpen(false)}>Events</Link>
        <Link href="/vendors" onClick={() => setMenuOpen(false)}>Vendors</Link>
        <Link href="/how-it-works" onClick={() => setMenuOpen(false)}>How It Works</Link>
        <div className={styles.mobileActions}>
          {!user ? (
            <>
              <Link href="/login" className={styles.btnLogin} onClick={() => setMenuOpen(false)}>
                Log in
              </Link>
              <Link href="/signup" className={styles.btnCta} onClick={() => setMenuOpen(false)}>
                Get Started
              </Link>
            </>
          ) : (
            <>
              <Link href={dashHref} className={styles.btnCta} onClick={() => setMenuOpen(false)}>
                Dashboard
              </Link>
              <Link href="/logout" className={styles.btnLogin} onClick={() => setMenuOpen(false)}>
                Log out
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  )
}
