'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import styles from './VendorPhotoGallery.module.css'

export default function VendorPhotoGallery({ photos, vendorName }) {
  const [lightboxPhotoIndex, setLightboxPhotoIndex] = useState(null)
  const isLightboxOpen = lightboxPhotoIndex !== null

  useEffect(() => {
    if (!isLightboxOpen) return
    const handleKeyDown = event => {
      if (event.key === 'Escape') setLightboxPhotoIndex(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isLightboxOpen])

  if (!Array.isArray(photos) || photos.length === 0) {
    return (
      <section className={styles.gallery} aria-labelledby="vendor-photos-heading">
        <h2 id="vendor-photos-heading" className={styles.heading}>Photos</h2>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No photos yet</p>
          <p className={styles.emptyBody}>This vendor has not added photos yet.</p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.gallery} aria-labelledby="vendor-photos-heading">
      <h2 id="vendor-photos-heading" className={styles.heading}>Photos</h2>
      <ul className={styles.grid}>
        {photos.map((photoUrl, photoIndex) => (
          <li key={photoUrl} className={styles.item}>
            <button
              type="button"
              onClick={() => setLightboxPhotoIndex(photoIndex)}
              className={styles.photoButton}
              aria-label={`View photo ${photoIndex + 1} of ${photos.length}`}
            >
              <Image
                src={photoUrl}
                alt={`${vendorName} photo ${photoIndex + 1}`}
                width={400}
                height={400}
                className={styles.photo}
              />
            </button>
          </li>
        ))}
      </ul>

      {isLightboxOpen ? (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxPhotoIndex(null)}
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setLightboxPhotoIndex(null)}
            aria-label="Close photo"
          >×</button>
          <Image
            src={photos[lightboxPhotoIndex]}
            alt={`${vendorName} photo ${lightboxPhotoIndex + 1}`}
            width={1200}
            height={1200}
            className={styles.lightboxImage}
          />
        </div>
      ) : null}
    </section>
  )
}
