'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

const BADGE_CLASS = {
  'Night Market':    'hcBadgeBlue',
  'Farmers Market':  'hcBadgeHerb',
  'Festival':        'hcBadgeGold',
  'Twilight Market': 'hcBadgePurple',
  'Pop-up':          'hcBadgeEmber',
}

const STATIC_EVENTS = [
  { slug:'rundle-mall-night-eats',     name:'Rundle Mall Night Eats',    category:'Night Market',    suburb:'CBD',           state:'SA', date_sort:'2026-04-12', spots_left:6,  fee_min:200, fee_max:350, deadline:'2026-04-05' },
  { slug:'glenelg-twilight',           name:'Glenelg Twilight Market',   category:'Twilight Market', suburb:'Glenelg Beach', state:'SA', date_sort:'2026-04-20', spots_left:4,  fee_min:180, fee_max:280, deadline:'2026-04-13' },
  { slug:'barossa-food-wine',          name:'Barossa Valley Harvest',    category:'Farmers Market',  suburb:'Tanunda',       state:'SA', date_sort:'2026-04-26', spots_left:8,  fee_min:250, fee_max:400, deadline:'2026-04-19' },
  { slug:'port-adelaide-night-market', name:'Port Adelaide Night Market', category:'Night Market',   suburb:'Port Adelaide', state:'SA', date_sort:'2026-05-03', spots_left:3,  fee_min:160, fee_max:260, deadline:'2026-04-26' },
  { slug:'victor-harbor-summer-fair',  name:'Victor Harbor Festival',    category:'Festival',        suburb:'Victor Harbor', state:'SA', date_sort:'2026-05-10', spots_left:12, fee_min:300, fee_max:500, deadline:'2026-05-03' },
  { slug:'prospect-farmers-market',    name:'Prospect Farmers Market',   category:'Farmers Market',  suburb:'Prospect',      state:'SA', date_sort:'2026-04-19', spots_left:5,  fee_min:150, fee_max:220, deadline:'2026-04-12' },
]

function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function feeStr(min, max) {
  if (min && max) return `$${min}\u2013$${max}`
  if (min) return `$${min}+`
  return '\u2014'
}

function dlDate(d) {
  if (!d) return '\u2014'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function Dropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value) || options[0]
  return (
    <div className={`${styles.seg} ${styles.segSel}`} onClick={() => setOpen(!open)}>
      <span className={styles.label}>{label}</span>
      <div className={styles.csel}>
        <span className={`${styles.cselVal} ${!value ? styles.placeholder : ''}`}>
          {selected.label}
        </span>
        <span className={styles.selArrow}>&#9662;</span>
        {open && (
          <div className={styles.cselDrop}>
            {options.map((opt) => (
              <div
                key={opt.value}
                className={`${styles.cselOpt} ${opt.value === value ? styles.selected : ''}`}
                onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false) }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CardStack({ events }) {
  const router = useRouter()
  const [cards, setCards] = useState([])
  const poolRef = useRef([])
  const nextIdxRef = useRef(3)
  const progressRef = useRef(null)

  useEffect(() => {
    const pool = [...events]
    for (const s of STATIC_EVENTS) {
      if (pool.length >= 6) break
      if (!pool.find(e => e.name === s.name)) pool.push(s)
    }
    poolRef.current = pool
    if (pool.length === 0) return

    const count = Math.min(pool.length, 6)
    const initial = []
    for (let i = 0; i < count; i++) {
      initial.push({ ...pool[i], pos: i < 3 ? i : -1 })
    }
    if (pool.length === 1) initial[0].pos = 2
    else if (pool.length === 2) { initial[0].pos = 1; initial[1].pos = 2 }

    setCards(initial)
    nextIdxRef.current = 3 % count
  }, [events])

  const startProgress = useCallback(() => {
    const bar = progressRef.current
    if (!bar) return
    bar.classList.remove(styles.hcProgressAnimating)
    void bar.offsetWidth
    bar.classList.add(styles.hcProgressAnimating)
  }, [])

  useEffect(() => {
    if (cards.length < 3) return
    startProgress()

    const timer = setInterval(() => {
      setCards(prev => {
        const next = prev.map(c => {
          if (c.pos >= 0) return { ...c, pos: (c.pos + 1) % 3 }
          return c
        })

        setTimeout(() => {
          setCards(curr => {
            const pool = poolRef.current
            const idx = nextIdxRef.current
            const updated = curr.map(c => {
              if (c.pos === 0) {
                nextIdxRef.current = (idx + 1) % pool.length
                return { ...pool[idx], pos: 0 }
              }
              return c
            })
            return updated
          })
        }, 380)

        return next
      })
      startProgress()
    }, 3500)

    return () => clearInterval(timer)
  }, [cards.length, startProgress])

  if (cards.length === 0) {
    return <div className={styles.cardEmpty}>Events coming soon</div>
  }

  const frontCard = cards.find(c => c.pos === 2)

  return (
    <div
      className={styles.cardStack}
      onClick={() => {
        const slug = frontCard?.slug || frontCard?.id
        router.push(slug ? `/events/${slug}` : '/events')
      }}
    >
      {cards.map((ev, i) => {
        const badge = BADGE_CLASS[ev.category] || 'hcBadgeEmber'
        const loc = [ev.suburb, ev.state].filter(Boolean).join(', ')
        const spots = ev.spots_left != null ? ev.spots_left : '\u2014'
        const isFront = ev.pos === 2

        return (
          <div key={i} className={styles.hc} data-pos={ev.pos}>
            <span className={`${styles.hcBadge} ${styles[badge]}`}>{ev.category || 'Market'}</span>
            <div className={styles.hcTitle}>{ev.name}</div>
            <div className={styles.hcMeta}>{'\uD83D\uDCCD'} {loc} &nbsp;&middot;&nbsp; {'\uD83D\uDCC5'} {fmtDate(ev.date_sort)}</div>
            <div className={styles.hcAttend}>{'\uD83E\uDE91'} {spots} spots left</div>
            <div className={styles.hcFooter}>
              <span>Booth: <strong>{feeStr(ev.fee_min, ev.fee_max)}</strong></span>
              <span>Deadline: {dlDate(ev.deadline)}</span>
            </div>
            <div
              ref={isFront ? progressRef : undefined}
              className={styles.hcProgress}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function HeroSection({ events = [] }) {
  const router = useRouter()
  const [location, setLocation] = useState('')
  const [when, setWhen] = useState('')
  const [type, setType] = useState('')

  function handleSearch(e) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (location) params.set('location', location)
    if (when) params.set('when', when)
    if (type) params.set('category', type)
    router.push(`/events?${params.toString()}`)
  }

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
            <Link href="/signup/vendor" className={styles.ghostBtn}>Find your next pitch &rarr;</Link>
            <Link href="/signup/organiser" className={styles.ghostBtn}>List your market &rarr;</Link>
          </div>

          <p className={styles.searchLabel}>or browse upcoming markets near you</p>

          <form className={styles.search} onSubmit={handleSearch}>
            <div className={`${styles.seg} ${styles.segLoc}`}>
              <span className={styles.label}>Location</span>
              <input
                className={styles.input}
                type="text"
                placeholder="Suburb or postcode"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className={styles.div} />

            <Dropdown label="When" options={WHEN_OPTIONS} value={when} onChange={setWhen} />

            <div className={styles.div} />

            <Dropdown label="Market type" options={TYPE_OPTIONS} value={type} onChange={setType} />

            <button type="submit" className={styles.btn}>Search</button>
          </form>
        </div>

        <div className={styles.right}>
          <CardStack events={events} />
        </div>
      </section>
    </>
  )
}
