'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import VendorProfileHeader from './VendorProfileHeader'
import VendorBioSection from './VendorBioSection'
import VendorPhotoGallery from './VendorPhotoGallery'
import VendorMenuItems from './VendorMenuItems'
import VendorReviews from './VendorReviews'
import VendorUpcomingEvents from './VendorUpcomingEvents'
import VendorContactModal from './VendorContactModal'
import styles from './VendorDetail.module.css'

const CONTACT_TOAST_DURATION_MS = 4000

export default function VendorDetail({ vendor, menuItems }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [isSessionLoaded, setIsSessionLoaded] = useState(false)
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [isSuccessToastVisible, setIsSuccessToastVisible] = useState(false)

  useEffect(() => {
    let isCancelled = false
    async function loadCurrentUser() {
      try {
        const response = await fetch('/api/me', { credentials: 'include' })
        if (!response.ok) throw new Error(`[loadCurrentUser] ${response.status}`)
        const data = await response.json()
        if (!isCancelled) setCurrentUser(data?.user ?? null)
      } catch (error) {
        console.error('[VendorDetail.loadCurrentUser]', {
          message: error.message,
          endpoint: '/api/me',
          timestamp: new Date().toISOString(),
        })
        if (!isCancelled) setCurrentUser(null)
      } finally {
        if (!isCancelled) setIsSessionLoaded(true)
      }
    }
    loadCurrentUser()
    return () => { isCancelled = true }
  }, [])

  useEffect(() => {
    if (!isSuccessToastVisible) return
    const toastTimeoutId = setTimeout(
      () => setIsSuccessToastVisible(false),
      CONTACT_TOAST_DURATION_MS
    )
    return () => clearTimeout(toastTimeoutId)
  }, [isSuccessToastVisible])

  const handleContactButtonClick = useCallback(() => {
    setIsContactModalOpen(true)
  }, [])

  const handleContactModalClose = useCallback(() => {
    setIsContactModalOpen(false)
  }, [])

  const handleContactMessageSent = useCallback(() => {
    setIsContactModalOpen(false)
    setIsSuccessToastVisible(true)
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link href={ROUTES.VENDORS}>Vendors</Link>
        <span aria-hidden="true">›</span>
        <span>{vendor.tradingName}</span>
      </div>

      <VendorProfileHeader vendor={vendor} />

      <div className={styles.grid}>
        <div className={styles.mainColumn}>
          <VendorBioSection vendor={vendor} />
          <VendorPhotoGallery photos={vendor.photos} vendorName={vendor.tradingName} />
          <VendorMenuItems menuItems={menuItems} />
          <VendorReviews
            reviews={[]}
            averageRating={vendor.rating}
            reviewCount={vendor.reviewCount}
          />
          <VendorUpcomingEvents upcomingEvents={[]} />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.contactCard}>
            <h3 className={styles.contactHeading}>Interested in this vendor?</h3>
            <p className={styles.contactBody}>
              Organisers can start a conversation directly. Vendors respond
              within 48 hours on average.
            </p>
            <ContactButton
              isSessionLoaded={isSessionLoaded}
              currentUser={currentUser}
              onClick={handleContactButtonClick}
            />
          </div>
        </aside>
      </div>

      {isContactModalOpen ? (
        <VendorContactModal
          vendor={vendor}
          organiserUserId={currentUser?.id}
          onClose={handleContactModalClose}
          onMessageSent={handleContactMessageSent}
        />
      ) : null}

      {isSuccessToastVisible ? (
        <div className={styles.toast} role="status">
          Message sent. The vendor will be notified by email.
        </div>
      ) : null}
    </div>
  )
}

function ContactButton({ isSessionLoaded, currentUser, onClick }) {
  if (!isSessionLoaded) {
    return <div className={styles.contactButtonSkeleton} aria-hidden="true" />
  }
  if (!currentUser) {
    return (
      <Link href={ROUTES.SIGNUP} className={styles.contactPrimary}>
        Sign up to contact
      </Link>
    )
  }
  if (currentUser.role === 'organiser') {
    return (
      <button type="button" onClick={onClick} className={styles.contactPrimary}>
        Message this vendor
      </button>
    )
  }
  return null
}
