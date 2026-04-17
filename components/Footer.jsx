import { memo } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { CONTACT_EMAIL, SOCIAL_LINKS, COPYRIGHT_YEAR } from '@/constants/ui'
import styles from './Footer.module.css'

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.main}>
        <div>
          <div className={styles.colTitle}>For Vendors</div>
          <ul className={styles.linkList}>
            <li><Link href={ROUTES.SIGNUP_VENDOR}>Sign up as vendor</Link></li>
            <li><Link href={ROUTES.HOW_IT_WORKS}>How it works</Link></li>
            <li><Link href={ROUTES.PRICING}>Pricing</Link></li>
            <li><Link href={ROUTES.VENDORS}>Browse vendors</Link></li>
          </ul>
        </div>

        <div>
          <div className={styles.colTitle}>For Organisers</div>
          <ul className={styles.linkList}>
            <li><Link href={ROUTES.EVENTS_NEW}>Post an event</Link></li>
            <li><Link href={ROUTES.HOW_IT_WORKS}>How it works</Link></li>
            <li><Link href={ROUTES.CONTACT}>Talk to sales</Link></li>
            <li><Link href={ROUTES.EVENTS}>Find vendors</Link></li>
          </ul>
        </div>

        <div>
          <div className={styles.colTitle}>Company</div>
          <ul className={styles.linkList}>
            <li><Link href={ROUTES.ABOUT}>About</Link></li>
            <li><Link href={ROUTES.CONTACT}>Contact</Link></li>
            <li><Link href={ROUTES.TERMS}>Terms</Link></li>
            <li><Link href={ROUTES.PRIVACY}>Privacy</Link></li>
          </ul>
        </div>

        <div>
          <div className={styles.colTitle}>Connect</div>
          <div className={styles.socials}>
            <a href={SOCIAL_LINKS.INSTAGRAM} className={styles.socIcon} title="Instagram" target="_blank" rel="noopener noreferrer">&#9672;</a>
            <a href={SOCIAL_LINKS.X} className={styles.socIcon} title="X" target="_blank" rel="noopener noreferrer">&#120143;</a>
            <a href={SOCIAL_LINKS.FACEBOOK} className={styles.socIcon} title="Facebook" target="_blank" rel="noopener noreferrer">f</a>
            <a href={SOCIAL_LINKS.LINKEDIN} className={styles.socIcon} title="LinkedIn" target="_blank" rel="noopener noreferrer">in</a>
          </div>
          <ul className={styles.linkList}>
            <li><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
          </ul>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.bottomLeft}>
          <Link href={ROUTES.HOME} className={styles.bottomLogo}>
            Pitch<span className={styles.dot}>.</span>
          </Link>
          <span className={styles.copy}>
            Australia&apos;s marketplace for food vendors and events.
          </span>
        </div>
        <span className={styles.copy}>&copy; {COPYRIGHT_YEAR} Pitch. Adelaide, Australia.</span>
      </div>
    </footer>
  )
}

export default memo(Footer)
