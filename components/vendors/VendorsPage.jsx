'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { VENDORS_PER_PAGE } from '@/constants/limits'
import VendorFilters from './VendorFilters'
import VendorResultsMeta from './VendorResultsMeta'
import VendorsGrid from './VendorsGrid'
import Pagination from '@/components/events/Pagination'
import styles from './VendorsPage.module.css'

const SORT_LABELS = {
  featured: 'Featured',
  az: 'A\u2013Z',
  za: 'Z\u2013A',
}

const PLAN_TIER_ORDER = { growth: 0, pro: 1, free: 2, starter: 2, basic: 2 }

function comparePlanTier(aVendor, bVendor) {
  const aRank = PLAN_TIER_ORDER[aVendor.plan?.toLowerCase()] ?? 3
  const bRank = PLAN_TIER_ORDER[bVendor.plan?.toLowerCase()] ?? 3
  return aRank - bRank
}

function VendorsPage({ vendors = [] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [searchQuery, setSearchQuery] = useState('')
  const [cuisineFilter, setCuisineFilter] = useState('')
  const [setupTypeFilter, setSetupTypeFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('featured')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const queryParam = searchParams.get('q')
    const cuisineParam = searchParams.get('cuisine')
    const setupParam = searchParams.get('setup')
    const sortParam = searchParams.get('sort')

    if (queryParam) setSearchQuery(queryParam)
    if (cuisineParam) setCuisineFilter(cuisineParam)
    if (setupParam) setSetupTypeFilter(setupParam)
    if (sortParam) setSortOrder(sortParam)
  }, [searchParams])

  const updateUrlParams = useCallback((updatedFilters) => {
    const params = new URLSearchParams()
    if (updatedFilters.search) params.set('q', updatedFilters.search)
    if (updatedFilters.cuisine) params.set('cuisine', updatedFilters.cuisine)
    if (updatedFilters.setupType) params.set('setup', updatedFilters.setupType)
    if (updatedFilters.sort && updatedFilters.sort !== 'featured') params.set('sort', updatedFilters.sort)
    const paramString = params.toString()
    router.replace(paramString ? `${pathname}?${paramString}` : pathname, { scroll: false })
  }, [router, pathname])

  const filters = {
    search: searchQuery,
    cuisine: cuisineFilter,
    setupType: setupTypeFilter,
    sort: sortOrder,
  }

  const handleFilterChange = useCallback((field, value) => {
    const setters = {
      search: setSearchQuery,
      cuisine: setCuisineFilter,
      setupType: setSetupTypeFilter,
      sort: setSortOrder,
    }
    const setter = setters[field]
    if (setter) setter(value)
    setCurrentPage(1)

    const updatedFilters = { ...filters, [field]: value }
    updateUrlParams(updatedFilters)
  }, [filters, updateUrlParams])

  const handleClearAllFilters = useCallback(() => {
    setSearchQuery('')
    setCuisineFilter('')
    setSetupTypeFilter('')
    setSortOrder('featured')
    setCurrentPage(1)
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  const handleRemoveFilter = useCallback((field) => {
    handleFilterChange(field, field === 'sort' ? 'featured' : '')
  }, [handleFilterChange])

  const handlePageChange = useCallback((pageNumber) => {
    setCurrentPage(pageNumber)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const filteredVendors = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim()
    return vendors.filter((vendor) => {
      if (searchLower) {
        const nameMatches = vendor.name.toLowerCase().includes(searchLower)
        const tagMatches = Array.isArray(vendor.tags)
          && vendor.tags.some((tag) => tag.toLowerCase().includes(searchLower))
        if (!nameMatches && !tagMatches) return false
      }
      if (cuisineFilter) {
        const tagsAsArray = Array.isArray(vendor.tags) ? vendor.tags : []
        if (!tagsAsArray.includes(cuisineFilter)) return false
      }
      if (setupTypeFilter && vendor.subtitle !== setupTypeFilter) return false
      return true
    })
  }, [vendors, searchQuery, cuisineFilter, setupTypeFilter])

  const sortedVendors = useMemo(() => {
    const sorted = [...filteredVendors]
    if (sortOrder === 'az') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortOrder === 'za') {
      sorted.sort((a, b) => b.name.localeCompare(a.name))
    } else {
      sorted.sort((a, b) => {
        const tierDifference = comparePlanTier(a, b)
        if (tierDifference !== 0) return tierDifference
        return a.name.localeCompare(b.name)
      })
    }
    return sorted
  }, [filteredVendors, sortOrder])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedVendors.length / VENDORS_PER_PAGE)),
    [sortedVendors]
  )

  const paginatedVendors = useMemo(
    () => sortedVendors.slice((currentPage - 1) * VENDORS_PER_PAGE, currentPage * VENDORS_PER_PAGE),
    [sortedVendors, currentPage]
  )

  const activeFilterLabels = useMemo(() => {
    const labels = []
    if (cuisineFilter) labels.push({ field: 'cuisine', label: cuisineFilter })
    if (setupTypeFilter) labels.push({ field: 'setupType', label: setupTypeFilter })
    if (searchQuery) labels.push({ field: 'search', label: `"${searchQuery}"` })
    if (sortOrder !== 'featured') labels.push({ field: 'sort', label: SORT_LABELS[sortOrder] || sortOrder })
    return labels
  }, [cuisineFilter, setupTypeFilter, searchQuery, sortOrder])

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.tag}>VENDORS</div>
        <h1 className={styles.title}>
          Food <em>Vendors.</em>
          <span className={styles.count}>{sortedVendors.length} vendors</span>
        </h1>
        <p className={styles.subline}>
          Browse verified food vendors and mobile kitchens serving events and markets across South Australia.
        </p>
      </div>

      <VendorFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
      />

      <VendorResultsMeta
        filteredCount={sortedVendors.length}
        activeFilters={activeFilterLabels}
        onRemoveFilter={handleRemoveFilter}
      />

      <VendorsGrid vendors={paginatedVendors} />
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
    </div>
  )
}

export default VendorsPage
