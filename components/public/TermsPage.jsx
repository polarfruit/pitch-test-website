import { TERMS_SECTIONS } from './termsData'
import LegalDocBody from './LegalDocBody'
import LegalDocShell from './LegalDocShell'
import styles from './TermsPage.module.css'

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroHeading}>Terms of Service</h1>
        <div className={styles.heroMeta}>Last updated: March 2026</div>
      </div>

      <LegalDocShell sections={TERMS_SECTIONS}>
        <LegalDocBody sections={TERMS_SECTIONS} />
      </LegalDocShell>
    </div>
  )
}
