import styles from './VendorBioSection.module.css'

function renderAvailabilityLabel(availabilityValue) {
  if (availabilityValue === true || availabilityValue === 1) return 'Yes'
  if (availabilityValue === false || availabilityValue === 0) return 'No'
  return 'Not specified'
}

export default function VendorBioSection({ vendor }) {
  const { bio, stallDimensions, powerAvailable, waterAvailable } = vendor

  const hasAnyOperationalDetail =
    Boolean(stallDimensions) ||
    powerAvailable !== null ||
    waterAvailable !== null

  return (
    <section className={styles.bio} aria-labelledby="vendor-bio-heading">
      <h2 id="vendor-bio-heading" className={styles.heading}>About</h2>

      {bio ? (
        <p className={styles.body}>{bio}</p>
      ) : (
        <p className={styles.empty}>This vendor has not written a bio yet.</p>
      )}

      {hasAnyOperationalDetail ? (
        <dl className={styles.details}>
          {stallDimensions ? (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>Stall footprint</dt>
              <dd className={styles.detailValue}>{stallDimensions}</dd>
            </div>
          ) : null}
          {powerAvailable !== null ? (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>Power available</dt>
              <dd className={styles.detailValue}>
                {renderAvailabilityLabel(powerAvailable)}
              </dd>
            </div>
          ) : null}
          {waterAvailable !== null ? (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>Water available</dt>
              <dd className={styles.detailValue}>
                {renderAvailabilityLabel(waterAvailable)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  )
}
