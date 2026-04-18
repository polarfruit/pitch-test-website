'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CARD_ROTATION_INTERVAL_MS, CARD_SWAP_ANIMATION_DELAY_MS } from '@/constants/timing'
import { MAX_HERO_CARD_POOL_SIZE, VISIBLE_CARD_COUNT } from '@/constants/limits'
import { ROUTES } from '@/constants/routes'
import { formatEventDate, formatDeadlineDate, formatBoothFeeRange } from '@/lib/utils/eventFormatters'
import styles from './HeroSection.module.css'

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

function CardStack({ events, isLoading = false, error = null }) {
  const router = useRouter()
  const [cards, setCards] = useState([])
  const eventPoolRef = useRef([])
  const nextEventIndexRef = useRef(VISIBLE_CARD_COUNT)
  const progressBarRef = useRef(null)

  useEffect(() => {
    const eventPool = [...events]
    for (const staticEvent of STATIC_EVENTS) {
      if (eventPool.length >= MAX_HERO_CARD_POOL_SIZE) break
      if (!eventPool.find(existingEvent => existingEvent.name === staticEvent.name)) eventPool.push(staticEvent)
    }
    eventPoolRef.current = eventPool
    if (eventPool.length === 0) return

    const visibleCardCount = Math.min(eventPool.length, MAX_HERO_CARD_POOL_SIZE)
    const initialCards = []
    for (let i = 0; i < visibleCardCount; i++) {
      initialCards.push({ ...eventPool[i], pos: i < VISIBLE_CARD_COUNT ? i : -1 })
    }
    if (eventPool.length === 1) initialCards[0].pos = 2
    else if (eventPool.length === 2) { initialCards[0].pos = 1; initialCards[1].pos = 2 }

    setCards(initialCards)
    nextEventIndexRef.current = VISIBLE_CARD_COUNT % visibleCardCount
  }, [events])

  const startProgressAnimation = useCallback(() => {
    const progressBarElement = progressBarRef.current
    if (!progressBarElement) return
    progressBarElement.classList.remove(styles.hcProgressAnimating)
    void progressBarElement.offsetWidth
    progressBarElement.classList.add(styles.hcProgressAnimating)
  }, [])

  useEffect(() => {
    if (cards.length < VISIBLE_CARD_COUNT) return
    startProgressAnimation()

    const rotationTimer = setInterval(() => {
      setCards(previousCards => {
        const rotatedCards = previousCards.map(card => {
          if (card.pos >= 0) return { ...card, pos: (card.pos + 1) % VISIBLE_CARD_COUNT }
          return card
        })

        setTimeout(() => {
          setCards(currentCards => {
            const eventPool = eventPoolRef.current
            const nextEventIndex = nextEventIndexRef.current
            const updatedCards = currentCards.map(card => {
              if (card.pos === 0) {
                nextEventIndexRef.current = (nextEventIndex + 1) % eventPool.length
                return { ...eventPool[nextEventIndex], pos: 0 }
              }
              return card
            })
            return updatedCards
          })
        }, CARD_SWAP_ANIMATION_DELAY_MS)

        return rotatedCards
      })
      startProgressAnimation()
    }, CARD_ROTATION_INTERVAL_MS)

    return () => clearInterval(rotationTimer)
  }, [cards.length, startProgressAnimation])

  if (isLoading) {
    return <div className={styles.cardEmpty}>Loading events{'\u2026'}</div>
  }

  if (error) {
    return <div className={styles.cardEmpty}>Unable to load events</div>
  }

  if (cards.length === 0) {
    return <div className={styles.cardEmpty}>Events coming soon</div>
  }

  const frontCard = cards.find(card => card.pos === 2)

  return (
    <div
      className={styles.cardStack}
      onClick={() => {
        const slug = frontCard?.slug || frontCard?.id
        router.push(slug ? `/events/${slug}` : ROUTES.EVENTS)
      }}
    >
      {cards.map((card, cardIndex) => {
        const badgeClassName = BADGE_CLASS[card.category] || 'hcBadgeEmber'
        const locationLabel = [card.suburb, card.state].filter(Boolean).join(', ')
        const spotsLeftDisplay = card.spots_left != null ? card.spots_left : '\u2014'
        const isFrontCard = card.pos === 2

        return (
          <div key={cardIndex} className={styles.hc} data-pos={card.pos}>
            <span className={`${styles.hcBadge} ${styles[badgeClassName]}`}>{card.category || 'Market'}</span>
            <div className={styles.hcTitle}>{card.name}</div>
            <div className={styles.hcMeta}>{'\uD83D\uDCCD'} {locationLabel} &nbsp;&middot;&nbsp; {'\uD83D\uDCC5'} {formatEventDate(card.date_sort)}</div>
            <div className={styles.hcAttend}>{'\uD83E\uDE91'} {spotsLeftDisplay} spots left</div>
            <div className={styles.hcFooter}>
              <span>Booth: <strong>{formatBoothFeeRange(card.fee_min, card.fee_max)}</strong></span>
              <span>Deadline: {formatDeadlineDate(card.deadline)}</span>
            </div>
            <div
              ref={isFrontCard ? progressBarRef : undefined}
              className={styles.hcProgress}
            />
          </div>
        )
      })}
    </div>
  )
}

export default CardStack
