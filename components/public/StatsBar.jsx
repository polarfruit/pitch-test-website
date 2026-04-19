import { memo } from 'react'
import styles from './StatsBar.module.css'

const SIGNALS = [
  'ABN verified',
  'Food safety certified',
  '$10M liability insured',
  'Free during founding phase',
]

function StatsBar() {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        {SIGNALS.map((signalText) => (
          <div key={signalText} className={styles.item}>
            <span className={styles.icon} />
            <span className={styles.sig}>{signalText}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(StatsBar)
