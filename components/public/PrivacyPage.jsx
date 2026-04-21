import { PRIVACY_SECTIONS } from './privacyData'
import LegalDocBody from './LegalDocBody'
import LegalDocShell from './LegalDocShell'
import styles from './PrivacyPage.module.css'

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroHeading}>Privacy Policy</h1>
        <div className={styles.heroMeta}>Last updated: March 2026</div>
      </div>

      <LegalDocShell sections={PRIVACY_SECTIONS}>
        <LegalDocBody sections={PRIVACY_SECTIONS} />
      </LegalDocShell>
    </div>
  )
}
