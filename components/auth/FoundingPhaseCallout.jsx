import styles from './FoundingPhaseCallout.module.css'

export default function FoundingPhaseCallout() {
  return (
    <div className={styles.callout} role="note">
      <span className={styles.emoji} aria-hidden="true">🎉</span>
      <div className={styles.body}>
        <p className={styles.heading}>You&apos;re joining during our founding phase</p>
        <p className={styles.text}>
          Every feature is yours — free — while we build Pitch across South Australia.
          Founding members lock in special rates when pricing is introduced.
        </p>
      </div>
    </div>
  )
}
