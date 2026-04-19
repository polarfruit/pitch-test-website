'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { EVENTS_PER_PAGE } from '@/constants/limits'
import FilterBar from './FilterBar'
import CalendarPopup from './CalendarPopup'
import ResultsMeta from './ResultsMeta'
import EventsGrid from './EventsGrid'
import Pagination from './Pagination'
import { computeDateRangeFromWhenParam } from '@/lib/utils/dateHelpers'
import styles from './EventsPage.module.css'

const EventsMap = dynamic(() => import('./EventsMap'), { ssr: false })

const SORT_LABELS = {
  soonest: 'Soonest',
  latest: 'Latest',
  'most-spots': 'Most Spots',
  'fewest-spots': 'Fewest Spots',
}

function EventsPage({ events = [] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('soonest')
  const [currentPage, setCurrentPage] = useState(1)
  const [currentView, setCurrentView] = useState('grid')
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  useEffect(() => {
    const queryParam = searchParams.get('q')
    const typeParam = searchParams.get('type')
    const whenParam = searchParams.get('when')

    if (queryParam) setSearchQuery(queryParam)
    if (typeParam) setCategoryFilter(typeParam)
    if (whenParam) {
      const { dateFrom, dateTo } = computeDateRangeFromWhenParam(whenParam)
      if (dateFrom) setDateFromFilter(dateFrom)
      if (dateTo) setDateToFilter(dateTo)
    }
  }, [searchParams])

  const updateUrlParams = useCallback((updatedFilters) => {
    const params = new URLSearchParams()
    if (updatedFilters.search) params.set('q', updatedFilters.search)
    if (updatedFilters.category) params.set('type', updatedFilters.category)
    if (updatedFilters.dateFrom) params.set('from', updatedFilters.dateFrom)
    if (updatedFilters.dateTo) params.set('to', updatedFilters.dateTo)
    const paramString = params.toString()
    router.replace(paramString ? `${pathname}?${paramString}` : pathname, { scroll: false })
  }, [router, pathname])

  const filters = { search: searchQuery, category: categoryFilter, dateFrom: dateFromFilter, dateTo: dateToFilter, sort: sortOrder }

  const handleFilterChange = useCallback((field, value) => {
    const setters = { search: setSearchQuery, category: setCategoryFilter, dateFrom: setDateFromFilter, dateTo: setDateToFilter, sort: setSortOrder }
    const setter = setters[field]
    if (setter) setter(value)
    setCurrentPage(1)

    const updatedFilters = { ...filters, [field]: value }
    updateUrlParams(updatedFilters)
  }, [filters, updateUrlParams])

  const handleClearAllFilters = useCallback(() => {
    setSearchQuery('')
    setCategoryFilter('')
    setDateFromFilter('')
    setDateToFilter('')
    setSortOrder('soonest')
    setCurrentPage(1)
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  const handleRemoveFilter = useCallback((field) => {
    handleFilterChange(field, field === 'sort' ? 'soonest' : '')
  }, [handleFilterChange])

  const handlePageChange = useCallback((pageNumber) => {
    setCurrentPage(pageNumber)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleViewChange = useCallback((view) => {
    setCurrentView(view)
  }, [])

  const handleCalendarToggle = useCallback(() => {
    setIsCalendarOpen((isOpen) => !isOpen)
  }, [])

  const filteredEvents = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim()
    return events.filter((event) => {
      if (searchLower && !event.name.toLowerCase().includes(searchLower) && !event.suburb.toLowerCase().includes(searchLower)) return false
      if (categoryFilter && event.category !== categoryFilter) return false
      const eventEnd = event.dateEnd || event.date
      if (dateFromFilter && eventEnd < dateFromFilter) return false
      if (dateToFilter && event.date > dateToFilter) return false
      return true
    })
  }, [events, searchQuery, categoryFilter, dateFromFilter, dateToFilter])

  const sortedEvents = useMemo(() => {
    const sorted = [...filteredEvents]
    if (sortOrder === 'soonest') sorted.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
    if (sortOrder === 'latest') sorted.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    if (sortOrder === 'most-spots') sorted.sort((a, b) => (b.total - b.filled) - (a.total - a.filled))
    if (sortOrder === 'fewest-spots') sorted.sort((a, b) => (a.total - a.filled) - (b.total - b.filled))

    const today = new Date().toISOString().slice(0, 10)
    sorted.sort((a, b) => {
      const aIsPast = (a.dateEnd || a.date || '') < today ? 1 : 0
      const bIsPast = (b.dateEnd || b.date || '') < today ? 1 : 0
      return aIsPast - bIsPast
    })
    return sorted
  }, [filteredEvents, sortOrder])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedEvents.length / EVENTS_PER_PAGE)),
    [sortedEvents]
  )

  const paginatedEvents = useMemo(
    () => sortedEvents.slice((currentPage - 1) * EVENTS_PER_PAGE, currentPage * EVENTS_PER_PAGE),
    [sortedEvents, currentPage]
  )

  const activeFilterLabels = useMemo(() => {
    const labels = []
    if (categoryFilter) labels.push({ field: 'category', label: categoryFilter })
    if (searchQuery) labels.push({ field: 'search', label: `"${searchQuery}"` })
    if (dateFromFilter || dateToFilter) labels.push({ field: 'dateFrom', label: `${dateFromFilter || '\u2026'} \u2192 ${dateToFilter || '\u2026'}` })
    if (sortOrder !== 'soonest') labels.push({ field: 'sort', label: SORT_LABELS[sortOrder] || sortOrder })
    return labels
  }, [categoryFilter, searchQuery, dateFromFilter, dateToFilter, sortOrder])

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.tag}>EVENTS</div>
        <h1 className={styles.title}>
          Upcoming <em>Events.</em>
          <span className={styles.count}>{sortedEvents.length} events</span>
        </h1>
        <p className={styles.subline}>
          Browse verified events and markets looking for food vendors across South Australia.
        </p>
      </div>

      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
        onCalendarToggle={handleCalendarToggle}
        isCalendarOpen={isCalendarOpen}
      />

      {isCalendarOpen && (
        <CalendarPopup
          startDate={dateFromFilter}
          endDate={dateToFilter}
          isOpen={isCalendarOpen}
          onClose={handleCalendarToggle}
          onApply={(from, to) => {
            handleFilterChange('dateFrom', from)
            handleFilterChange('dateTo', to)
            handleCalendarToggle()
          }}
          onClear={() => {
            handleFilterChange('dateFrom', '')
            handleFilterChange('dateTo', '')
          }}
        />
      )}

      <ResultsMeta
        filteredCount={sortedEvents.length}
        activeFilters={activeFilterLabels}
        currentView={currentView}
        onViewChange={handleViewChange}
        onClearFilters={handleClearAllFilters}
        onRemoveFilter={handleRemoveFilter}
      />

      {currentView === 'grid' ? (
        <>
          <EventsGrid events={paginatedEvents} />
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
        </>
      ) : (
        <EventsMap events={filteredEvents} />
      )}
    </div>
  )
}

export default EventsPage
