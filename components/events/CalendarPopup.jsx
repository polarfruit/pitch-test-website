'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import CalendarMonthGrid from './CalendarMonthGrid'
import styles from './CalendarPopup.module.css'

function toIsoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function toDisplayDate(iso) {
  if (!iso) return ''
  const parts = iso.split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function getTodayIso() {
  const now = new Date()
  return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate())
}

function generateMonthDays(year, month) {
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayIso = getTodayIso()
  const days = []

  for (let emptyIndex = 0; emptyIndex < firstDayOfWeek; emptyIndex++) {
    days.push({ iso: null, dayNumber: null, isEmpty: true, isPast: false, isToday: false })
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
    const iso = toIsoDate(year, month, dayNumber)
    days.push({
      iso,
      dayNumber,
      isEmpty: false,
      isPast: iso < todayIso,
      isToday: iso === todayIso,
    })
  }

  return days
}

function CalendarPopup({ startDate, endDate, onApply, onClear, isOpen, onClose }) {
  const popupRef = useRef(null)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [localStart, setLocalStart] = useState(null)
  const [localEnd, setLocalEnd] = useState(null)
  const [hoverDate, setHoverDate] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    setLocalStart(startDate || null)
    setLocalEnd(endDate || null)
    setHoverDate(null)
    const baseDate = startDate ? new Date(startDate + 'T00:00:00') : new Date()
    setViewYear(baseDate.getFullYear())
    setViewMonth(baseDate.getMonth())
  }, [isOpen, startDate, endDate])

  useEffect(() => {
    if (!isOpen) return
    function handleOutsideMouseDown(mouseEvent) {
      if (popupRef.current && !popupRef.current.contains(mouseEvent.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutsideMouseDown)
    return () => document.removeEventListener('mousedown', handleOutsideMouseDown)
  }, [isOpen, onClose])

  const handleDayClick = useCallback((iso) => {
    if (!localStart || (localStart && localEnd)) {
      setLocalStart(iso)
      setLocalEnd(null)
      setHoverDate(null)
    } else if (iso === localStart) {
      setLocalStart(null)
      setLocalEnd(null)
      setHoverDate(null)
    } else {
      const sortedStart = iso < localStart ? iso : localStart
      const sortedEnd = iso < localStart ? localStart : iso
      setLocalStart(sortedStart)
      setLocalEnd(sortedEnd)
      setHoverDate(null)
    }
  }, [localStart, localEnd])

  const handleDayHover = useCallback((iso) => {
    if (!localStart || localEnd) return
    setHoverDate(iso)
  }, [localStart, localEnd])

  const handleMouseLeave = useCallback(() => { setHoverDate(null) }, [])

  function handlePreviousMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }

  function handleNextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  function handleClear() {
    setLocalStart(null)
    setLocalEnd(null)
    setHoverDate(null)
    onClear()
  }

  function handleApply() {
    const effectiveEnd = localStart && !localEnd ? localStart : localEnd
    if (localStart) onApply(localStart, effectiveEnd)
    onClose()
  }

  function getDayClassName(day) {
    if (day.isEmpty) return `${styles.day} ${styles.empty}`
    const classes = [styles.day]
    if (day.isPast) classes.push(styles.past)
    if (day.isToday) classes.push(styles.today)

    const isStart = localStart && day.iso === localStart
    const isEnd = localEnd && day.iso === localEnd

    if (isStart && isEnd) classes.push(styles.start, styles.end, styles.startEnd)
    else if (isStart) classes.push(styles.start)
    else if (isEnd) classes.push(styles.end)

    if (localStart && localEnd && day.iso > localStart && day.iso < localEnd) {
      classes.push(styles.inRange)
    }

    if (localStart && !localEnd && hoverDate && hoverDate !== localStart) {
      const hoverMin = hoverDate < localStart ? hoverDate : localStart
      const hoverMax = hoverDate < localStart ? localStart : hoverDate
      if (day.iso > hoverMin && day.iso < hoverMax) classes.push(styles.inRange)
      if (day.iso === hoverDate) classes.push(styles.hoverEnd)
    }

    return classes.join(' ')
  }

  const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1
  const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear
  const monthADays = generateMonthDays(viewYear, viewMonth)
  const monthBDays = generateMonthDays(nextYear, nextMonth)

  return (
    <div ref={popupRef} className={`${styles.popup} ${isOpen ? styles.popupOpen : ''}`}>
      <div className={styles.popupInner}>
        <CalendarMonthGrid
          year={viewYear} month={viewMonth} days={monthADays} slot="a"
          getDayClassName={getDayClassName} onDayClick={handleDayClick}
          onDayHover={handleDayHover} onMouseLeave={handleMouseLeave}
          onPreviousMonth={handlePreviousMonth} onNextMonth={handleNextMonth}
        />
        <div className={styles.divider} />
        <CalendarMonthGrid
          year={nextYear} month={nextMonth} days={monthBDays} slot="b"
          getDayClassName={getDayClassName} onDayClick={handleDayClick}
          onDayHover={handleDayHover} onMouseLeave={handleMouseLeave}
          onPreviousMonth={handlePreviousMonth} onNextMonth={handleNextMonth}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.selectedLabel}>
          {!localStart && !localEnd && 'Click a date to start'}
          {localStart && !localEnd && (
            <><span className={styles.selectedLabelStrong}>{toDisplayDate(localStart)}</span>{' \u2192 pick end date'}</>
          )}
          {localStart && localEnd && (
            <><span className={styles.selectedLabelStrong}>{toDisplayDate(localStart)}</span>{' \u2192 '}<span className={styles.selectedLabelStrong}>{toDisplayDate(localEnd)}</span></>
          )}
        </div>
        <div className={styles.footerActions}>
          <button type="button" className={styles.btnClear} onClick={handleClear}>Clear</button>
          <button type="button" className={styles.btnApply} onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  )
}

export default memo(CalendarPopup)
