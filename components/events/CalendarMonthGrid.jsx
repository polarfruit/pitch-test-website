import styles from './CalendarPopup.module.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function CalendarMonthGrid({
  year,
  month,
  days,
  getDayClassName,
  onDayClick,
  onDayHover,
  onMouseLeave,
  slot,
  onPreviousMonth,
  onNextMonth,
}) {
  return (
    <div className={styles.month}>
      <div className={styles.monthHeader}>
        {slot === 'a'
          ? <button type="button" className={styles.nav} onClick={onPreviousMonth}>&lsaquo;</button>
          : <span className={styles.navSpacer} />}
        <span className={styles.monthName}>{MONTH_NAMES[month]} {year}</span>
        {slot === 'b'
          ? <button type="button" className={styles.nav} onClick={onNextMonth}>&rsaquo;</button>
          : <span className={styles.navSpacer} />}
      </div>
      <div className={styles.grid} onMouseLeave={onMouseLeave}>
        {DAY_LABELS.map((label) => (
          <div key={label} className={styles.dow}>{label}</div>
        ))}
        {days.map((day, dayIndex) => (
          <button
            key={day.iso || `empty-${slot}-${dayIndex}`}
            type="button"
            className={getDayClassName(day)}
            onClick={day.isEmpty || day.isPast ? undefined : () => onDayClick(day.iso)}
            onMouseEnter={day.isEmpty || day.isPast ? undefined : () => onDayHover(day.iso)}
            disabled={day.isEmpty || day.isPast}
          >
            {day.dayNumber}
          </button>
        ))}
      </div>
    </div>
  )
}

export default CalendarMonthGrid
