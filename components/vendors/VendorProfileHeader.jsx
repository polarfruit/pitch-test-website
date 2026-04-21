import Image from 'next/image'
import styles from './VendorProfileHeader.module.css'

function computeAverageRating(rating) {
  if (typeof rating !== 'number' || Number.isNaN(rating)) return null
  return rating.toFixed(1)
}

export default function VendorProfileHeader({ vendor }) {
  const {
    tradingName,
    ownerName,
    avatarUrl,
    avatarGradient,
    verified,
    planLabel,
    plan,
    rating,
    reviewCount,
    tags,
    setupType,
  } = vendor

  const initials = tradingName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const averageRating = computeAverageRating(rating)
  const hasTags = Array.isArray(tags) && tags.length > 0

  return (
    <section className={styles.header}>
      <div
        className={styles.banner}
        style={{ background: avatarGradient }}
        aria-hidden="true"
      >
        <span className={styles.initialsWatermark}>{initials}</span>
      </div>

      <div className={styles.content}>
        <div
          className={styles.avatar}
          style={avatarUrl ? undefined : { background: avatarGradient }}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={`${tradingName} logo`}
              width={80}
              height={80}
              className={styles.avatarImage}
            />
          ) : (
            <span className={styles.avatarInitials}>{initials}</span>
          )}
        </div>

        <div className={styles.info}>
          <h1 className={styles.name}>{tradingName}</h1>
          {ownerName ? <p className={styles.owner}>Operated by {ownerName}</p> : null}

          <div className={styles.badges}>
            {verified ? (
              <span className={`${styles.badge} ${styles.badgeVerified}`}>
                <span aria-hidden="true">✓</span> Verified
              </span>
            ) : null}
            {plan && plan !== 'free' ? (
              <span className={`${styles.badge} ${styles.badgePlan}`}>
                {planLabel}
              </span>
            ) : null}
            {setupType ? (
              <span className={`${styles.badge} ${styles.badgeSetup}`}>
                {setupType}
              </span>
            ) : null}
          </div>

          {averageRating ? (
            <div className={styles.rating}>
              <span className={styles.ratingValue}>★ {averageRating}</span>
              <span className={styles.ratingMeta}>
                {reviewCount > 0 ? `${reviewCount} reviews` : 'No reviews yet'}
              </span>
            </div>
          ) : null}

          {hasTags ? (
            <ul className={styles.tagList}>
              {tags.map(tag => (
                <li key={tag} className={styles.tag}>{tag}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  )
}
