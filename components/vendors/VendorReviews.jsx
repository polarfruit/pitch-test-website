import styles from './VendorReviews.module.css'

function renderStarRow(rating) {
  const filledStarCount = Math.round(rating)
  return (
    <span className={styles.starRow} aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, starIndex) => (
        <span
          key={starIndex}
          className={starIndex < filledStarCount ? styles.starFilled : styles.starEmpty}
          aria-hidden="true"
        >★</span>
      ))}
    </span>
  )
}

export default function VendorReviews({ reviews, averageRating, reviewCount }) {
  const hasReviews = Array.isArray(reviews) && reviews.length > 0

  return (
    <section className={styles.reviews} aria-labelledby="vendor-reviews-heading">
      <div className={styles.headingRow}>
        <h2 id="vendor-reviews-heading" className={styles.heading}>Organiser reviews</h2>
        {typeof averageRating === 'number' && reviewCount > 0 ? (
          <div className={styles.summary}>
            {renderStarRow(averageRating)}
            <span className={styles.summaryText}>
              {averageRating.toFixed(1)} · {reviewCount} reviews
            </span>
          </div>
        ) : null}
      </div>

      {hasReviews ? (
        <ul className={styles.list}>
          {reviews.map(review => (
            <li key={review.id} className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <span className={styles.reviewAuthor}>{review.authorName}</span>
                {renderStarRow(review.rating)}
              </div>
              {review.createdAtLabel ? (
                <span className={styles.reviewDate}>{review.createdAtLabel}</span>
              ) : null}
              {review.body ? (
                <p className={styles.reviewBody}>{review.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No reviews yet</p>
          <p className={styles.emptyBody}>
            This vendor has not been reviewed by an organiser yet. Organiser
            reviews are added after a completed event.
          </p>
        </div>
      )}
    </section>
  )
}
