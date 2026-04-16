import Link from 'next/link'
import styles from './EventCard.module.css'

const CAT_IMG_CLASS = {
  'Night Market':    styles.imgNight,
  'Farmers Market':  styles.imgFarm,
  'Festival':        styles.imgFest,
  'Twilight Market': styles.imgTwi,
  'Pop-up':          styles.imgPort,
  'Corporate':       styles.imgBarossa,
}

const CAT_COLORS = {
  'Night Market':    { bg: 'rgba(43,91,168,0.07)', clr: '#2B5BA8' },
  'Farmers Market':  { bg: 'rgba(45,139,85,0.07)', clr: '#2D8B55' },
  'Festival':        { bg: 'rgba(232,80,10,0.07)', clr: '#E8500A' },
  'Twilight Market': { bg: 'rgba(43,91,168,0.07)', clr: '#2B5BA8' },
  'Pop-up':          { bg: 'rgba(107,90,74,0.08)', clr: '#A89880' },
  'Corporate':       { bg: 'rgba(201,132,10,0.07)', clr: '#C9840A' },
}

function fillColor(pct) {
  if (pct >= 90) return '#C0392B'
  if (pct >= 70) return '#C9840A'
  return '#2D8B55'
}

function spotsStyle(pct) {
  if (pct >= 90) return { background: 'rgba(192,57,43,0.08)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.16)' }
  if (pct >= 70) return { background: 'rgba(201,132,10,0.08)', color: '#C9840A', border: '1px solid rgba(201,132,10,0.16)' }
  return { background: 'rgba(45,139,85,0.08)', color: '#2D8B55', border: '1px solid rgba(45,139,85,0.16)' }
}

export default function EventCard({ event }) {
  const { id, name, category, suburb, state, dateLabel, filled, total, feeMin, feeMax, deadlineLabel, photo, spots_left, spots_total } = event
  const t = total ?? spots_total ?? 0
  const f = filled ?? (t - (spots_left ?? t)) ?? 0
  const pct = t > 0 ? Math.round((f / t) * 100) : 0
  const spots = spots_left ?? (t - f)
  const minFee = feeMin ?? event.fee_min
  const maxFee = feeMax ?? event.fee_max
  const catColor = CAT_COLORS[category] || { bg: 'rgba(107,90,74,0.08)', clr: '#6B5A4A' }
  const imgClass = CAT_IMG_CLASS[category] || styles.imgNight
  const fc = fillColor(pct)
  const sc = spotsStyle(pct)

  return (
    <Link href={`/events/${id}`} className={styles.card}>
      <div className={`${styles.img} ${imgClass}`}>
        {photo && (
          <img src={photo} alt={category} className={styles.photo} loading="lazy" />
        )}
        <div className={styles.overlay} />
        <span className={styles.catBadge} style={{ background: catColor.bg, color: catColor.clr }}>
          {category}
        </span>
        <span className={styles.spotsBadge} style={sc}>
          {spots} spot{spots === 1 ? '' : 's'} left
        </span>
      </div>
      <div className={styles.body}>
        <div className={styles.name}>{name}</div>
        <div className={styles.meta}>{'\u{1F4CD}'} {suburb}, {state}</div>
        <div className={styles.meta}>{'\u{1F4C5}'} {dateLabel}</div>
        <div className={styles.fillLabel}>
          <span>{filled}/{total} spots filled</span>
          <span style={{ color: fc, fontWeight: 700 }}>{pct}%</span>
        </div>
        <div className={styles.fillBg}>
          <div className={styles.fillInner} style={{ width: `${pct}%`, background: fc }} />
        </div>
        <div className={styles.footerRow}>
          <div className={styles.price}>Booth: <strong>${minFee}&ndash;${maxFee}</strong></div>
          <div className={styles.deadline}>Deadline: {deadlineLabel}</div>
        </div>
      </div>
    </Link>
  )
}
