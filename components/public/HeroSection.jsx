'use client'

import { useState, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import HeroSearchDropdown from './HeroSearchDropdown'
import CardStack from './HeroCardStack'
import styles from './HeroSection.module.css'

const WHEN_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'month', label: 'This month' },
  { value: 'next', label: 'Next month' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'Any type' },
  { value: 'Night Market', label: 'Night Market' },
  { value: 'Farmers Market', label: 'Farmers Market' },
  { value: 'Festival', label: 'Festival' },
  { value: 'Twilight Market', label: 'Twilight Market' },
  { value: 'Pop-up', label: 'Pop-up' },
]

function HeroSection({ events = [], isLoading = false, error = null }) {
  const router = useRouter()
  const [searchLocation, setSearchLocation] = useState('')
  const [searchWhenFilter, setSearchWhenFilter] = useState('')
  const [searchTypeFilter, setSearchTypeFilter] = useState('')

  const handleSearchFormSubmit = useCallback((submitEvent) => {
    submitEvent.preventDefault()
    const searchParameters = new URLSearchParams()
    if (searchLocation) searchParameters.set('location', searchLocation)
    if (searchWhenFilter) searchParameters.set('when', searchWhenFilter)
    if (searchTypeFilter) searchParameters.set('category', searchTypeFilter)
    router.push(`${ROUTES.EVENTS}?${searchParameters.toString()}`)
  }, [searchLocation, searchWhenFilter, searchTypeFilter, router])

  return (
    <>
      <div className={styles.heroBg} />
      <section className={styles.hero}>
        <div className={styles.left}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Now live in South Australia
          </div>

          <h1 className={styles.heading}>
            Find your<br /><em>Pitch.</em>
          </h1>

          <p className={styles.sub}>
            Australia&apos;s marketplace for food vendors and events.
          </p>

          <div className={styles.ctaRow}>
            <Link href={ROUTES.SIGNUP_VENDOR} className={styles.ghostBtn}>Find your next pitch &rarr;</Link>
            <Link href={ROUTES.SIGNUP_ORGANISER} className={styles.ghostBtn}>List your market &rarr;</Link>
          </div>

          <p className={styles.searchLabel}>or browse upcoming markets near you</p>

          <form className={styles.search} onSubmit={handleSearchFormSubmit}>
            <div className={`${styles.seg} ${styles.segLoc}`}>
              <span className={styles.label}>Location</span>
              <input
                className={styles.input}
                type="text"
                placeholder="Suburb or postcode"
                value={searchLocation}
                onChange={(inputEvent) => setSearchLocation(inputEvent.target.value)}
                autoComplete="off"
              />
            </div>

            <div className={styles.div} />

            <HeroSearchDropdown label="When" options={WHEN_OPTIONS} value={searchWhenFilter} onChange={setSearchWhenFilter} />

            <div className={styles.div} />

            <HeroSearchDropdown label="Market type" options={TYPE_OPTIONS} value={searchTypeFilter} onChange={setSearchTypeFilter} />

            <button type="submit" className={styles.btn}>Search</button>
          </form>
        </div>

        <div className={styles.right}>
          <CardStack events={events} isLoading={isLoading} error={error} />
        </div>
      </section>
    </>
  )
}

export default memo(HeroSection)
