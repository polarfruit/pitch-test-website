import styles from './StatsBar.module.css'

const SIGNALS = [
  'ABN verified',
  'Food safety certified',
  '$10M liability insured',
  'Free to join',
]

export default function StatsBar() {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        {SIGNALS.map((text, i) => (
          <div key={i} className={styles.item}>
            <span className={styles.icon} />
            <span className={styles.sig}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
