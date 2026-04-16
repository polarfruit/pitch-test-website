import Link from 'next/link'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.main}>
        <div>
          <div className={styles.colTitle}>For Vendors</div>
          <ul className={styles.linkList}>
            <li><Link href="/signup/vendor">Sign up as vendor</Link></li>
            <li><Link href="/how-it-works">How it works</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
            <li><Link href="/vendors">Browse vendors</Link></li>
          </ul>
        </div>

        <div>
          <div className={styles.colTitle}>For Organisers</div>
          <ul className={styles.linkList}>
            <li><Link href="/events/new">Post an event</Link></li>
            <li><Link href="/how-it-works">How it works</Link></li>
            <li><Link href="/contact">Talk to sales</Link></li>
            <li><Link href="/events">Find vendors</Link></li>
          </ul>
        </div>

        <div>
          <div className={styles.colTitle}>Company</div>
          <ul className={styles.linkList}>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/contact">Contact</Link></li>
            <li><Link href="/terms">Terms</Link></li>
            <li><Link href="/privacy">Privacy</Link></li>
          </ul>
        </div>

        <div>
          <div className={styles.colTitle}>Connect</div>
          <div className={styles.socials}>
            <a href="https://instagram.com/pitchmkts" className={styles.socIcon} title="Instagram" target="_blank" rel="noopener noreferrer">&#9672;</a>
            <a href="https://x.com/pitchmkts" className={styles.socIcon} title="X" target="_blank" rel="noopener noreferrer">&#120143;</a>
            <a href="https://facebook.com/pitchmkts" className={styles.socIcon} title="Facebook" target="_blank" rel="noopener noreferrer">f</a>
            <a href="https://linkedin.com/company/pitchmkts" className={styles.socIcon} title="LinkedIn" target="_blank" rel="noopener noreferrer">in</a>
          </div>
          <ul className={styles.linkList}>
            <li><a href="mailto:hello@onpitch.com.au">hello@onpitch.com.au</a></li>
          </ul>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.bottomLeft}>
          <Link href="/" className={styles.bottomLogo}>
            Pitch<span className={styles.dot}>.</span>
          </Link>
          <span className={styles.copy}>
            Australia&apos;s marketplace for food vendors and events.
          </span>
        </div>
        <span className={styles.copy}>&copy; 2026 Pitch. Adelaide, Australia.</span>
      </div>
    </footer>
  )
}
