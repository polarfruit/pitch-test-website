'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import styles from './HowItWorksPage.module.css'

const VENDOR_STEPS = [
  {
    num: '1',
    icon: '🏪',
    title: 'Create your profile',
    desc: 'Build a professional vendor profile with photos, cuisine tags, stall dimensions, power and water requirements, and your event history. Your profile is your pitch to every organiser on the platform.',
    tipLabel: 'Pro tip:',
    tip: 'Vendors with 3+ photos and a completed bio receive 4× more profile views than incomplete profiles.',
  },
  {
    num: '2',
    icon: '✅',
    title: 'Get verified',
    desc: 'Submit your ABN, current food safety supervisor certificate, and proof of $10M public liability insurance. Our team reviews and verifies within 1–2 business days. Verified vendors appear higher in search results and earn the blue verified badge on their profile.',
    tipLabel: 'Required:',
    tip: 'ABN registration · Food Safety Supervisor cert · $10M public liability insurance',
  },
  {
    num: '3',
    icon: '🔍',
    title: 'Browse & apply to events',
    desc: 'Search events by location, date range, event category, stall fee, and day of week. One-click applications attach your full profile automatically — no copy-pasting. Track all your applications from a single dashboard.',
    tipLabel: 'Filter options:',
    tip: 'Location · Date range · Day of week · Category · Fee range',
  },
  {
    num: '4',
    icon: '⚡',
    title: 'Get confirmed, show up, trade',
    desc: 'Once you apply, organisers can approve, decline, or leave your application open. If your application is still open when the event date arrives, it is automatically treated as unsuccessful. You can track your application status in real time from your dashboard.',
    tipLabel: 'Typical response time:',
    tip: 'Most organisers review applications within 3–5 days of posting. Check your dashboard for live status updates.',
  },
]

const ORGANISER_STEPS = [
  {
    num: '1',
    icon: '📝',
    title: 'Post your event',
    desc: 'List your event with dates, location, stall specifications, site fees, power and water availability, and any dietary or cuisine requirements. Takes less than 5 minutes. Your event goes live immediately to all verified vendors on the platform.',
    tipLabel: 'Pro tip:',
    tip: 'Events with photos and detailed stall specs attract significantly more applications.',
  },
  {
    num: '2',
    icon: '📥',
    title: 'Receive applications',
    desc: 'Verified vendors apply directly. Each application includes their full profile: photos, cuisine tags, certifications, stall dimensions, past event history, and ratings. Everything you need to make a confident decision — in one place.',
    tip: 'Every vendor has passed ABN, food safety, and insurance checks before they can apply.',
  },
  {
    num: '3',
    icon: '🎯',
    title: 'Approve your lineup',
    desc: 'One-click approve or decline from your dashboard. Approved vendors receive an instant notification with full event details. Declined vendors are notified automatically — no awkward emails. Build a diverse, balanced food lineup with full confidence.',
    tip: 'You can approve, decline, or leave applications open. Response rate is visible on your public profile.',
  },
  {
    num: '4',
    icon: '🎪',
    title: 'Event day, stress free',
    desc: 'Your confirmed vendor roster is live in your dashboard. Every vendor knows where to show up, what to bring, and when to arrive. In-app messaging handles last-minute questions. You focus on running a great event.',
    tipLabel: 'Typical time to full lineup:',
    tip: 'Most organisers fill their event within 5–7 days of posting.',
  },
]

const TRUST_CARDS = [
  {
    icon: '🏛️',
    title: 'ABN Verified',
    desc: 'Every vendor\'s Australian Business Number is confirmed with the ATO before their profile goes live — no unregistered operators on Pitch.',
  },
  {
    icon: '🍽️',
    title: 'Food Safety Certified',
    desc: 'We check that vendors hold a current Food Safety Supervisor certificate and that their local council registration is up to date.',
  },
  {
    icon: '🛡️',
    title: '$10M Public Liability',
    desc: 'All vendors must provide proof of at least $10 million in public liability insurance — the standard requirement for Australian events.',
  },
]

const VENDOR_FAQ = [
  { q: 'How long does vendor verification take?', a: 'Verification typically takes 1–2 business days after you submit your documents. You\'ll receive an email notification as soon as your account is approved. While pending, your profile is visible but marked as unverified.' },
  { q: 'Is Pitch. free to use for vendors?', a: 'The Starter plan is free — you can create a profile and apply to a limited number of events at no cost. Pro ($29/month) unlocks unlimited applications, priority placement, a Pro badge, direct messaging, and analytics. Growth ($79/month) is built for high-volume vendors and adds advanced analytics, featured placement, and dedicated support.' },
  { q: 'What if an organiser doesn\'t respond to my application?', a: 'Organisers can approve, decline, or leave applications open. If your application is still open when the event starts, it is automatically treated as unsuccessful. You can track all application statuses from your dashboard. Organiser response rates are visible on their public profile.' },
  { q: 'Can I apply to multiple events at once?', a: 'Yes. There\'s no limit on the number of simultaneous applications. Your dashboard shows all pending, approved, and declined applications in one place so you can track everything easily.' },
  { q: 'What subscription plans are available for vendors?', a: 'Pitch offers three plans — Starter (free), Pro ($29/month), and Growth ($79/month). Starter lets you apply to a limited number of events. Pro and Growth unlock more applications, priority placement, and advanced features.' },
  { q: 'What happens if a vendor cancels after being confirmed?', a: 'If a confirmed vendor cancels, it will be recorded on their profile and reflected in their reliability rating. Organisers are notified immediately and can re-open the spot to other applicants.' },
]

const ORGANISER_FAQ = [
  { q: 'How do I post an event?', a: 'Create an account, select Organiser, complete your event details including dates, location, stall specs and fees. Your event goes live immediately and verified vendors can start applying.' },
  { q: 'Is it free to list my event on Pitch?', a: 'Yes. Posting events is completely free. Pitch charges a small transaction fee when a vendor is confirmed and payment is processed.' },
  { q: 'How does the transaction fee work?', a: 'The transaction fee is charged at the time of vendor confirmation and is included in the stall fee. You set the stall price — Pitch adds the transaction fee on top.' },
  { q: 'Can I set my own stall fees?', a: 'Yes. You have full control over your stall pricing, dimensions, power and water availability, and any other requirements.' },
  { q: 'What happens if a confirmed vendor cancels?', a: 'You are notified immediately and the spot is automatically re-opened for other applicants. The cancellation is recorded on the vendor\'s profile and affects their reliability rating.' },
  { q: 'Can I message vendors before approving them?', a: 'Yes. You can message any vendor who has applied to your event through the in-app messaging system before making a decision.' },
]

export default function HowItWorksPage() {
  const [activeTab, setActiveTab] = useState('vendors')
  const [openFaqIndex, setOpenFaqIndex] = useState(null)

  const isVendorsTab = activeTab === 'vendors'
  const steps = isVendorsTab ? VENDOR_STEPS : ORGANISER_STEPS
  const faqs = isVendorsTab ? VENDOR_FAQ : ORGANISER_FAQ
  const stepsLabel = isVendorsTab ? 'For vendors' : 'For organisers'
  const stepsHeadingBefore = isVendorsTab ? 'From profile to ' : 'From listing to full '
  const stepsHeadingEm = isVendorsTab ? 'paid gig.' : 'lineup.'
  const stepsSub = isVendorsTab
    ? 'Four steps stand between you and your next event booking. No phone calls, no chasing emails.'
    : 'Four steps to filling your event with verified, insured food vendors. No phone calls, no chasing.'

  function handleTabClick(tab) {
    setActiveTab(tab)
    setOpenFaqIndex(null)
  }

  function handleFaqToggle(index) {
    setOpenFaqIndex(previous => (previous === index ? null : index))
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroTag}>How It Works</div>
        <h1 className={styles.heroTitle}>
          Your pitch, <em>simplified.</em>
        </h1>
        <p className={styles.heroSub}>
          Pitch. connects verified food vendors with event organisers across
          Australia. Here&apos;s everything you need to know, step by step.
        </p>
        <div className={styles.heroTabs}>
          <button
            type="button"
            className={`${styles.tab} ${isVendorsTab ? styles.tabActive : ''}`}
            onClick={() => handleTabClick('vendors')}
          >
            For Vendors
          </button>
          <button
            type="button"
            className={`${styles.tab} ${!isVendorsTab ? styles.tabActive : ''}`}
            onClick={() => handleTabClick('organisers')}
          >
            For Organisers
          </button>
        </div>
      </div>

      <div className={styles.sectionAlt}>
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{stepsLabel}</div>
          <h2 className={styles.sectionTitle}>
            {stepsHeadingBefore}<em>{stepsHeadingEm}</em>
          </h2>
          <p className={styles.sectionSub}>{stepsSub}</p>
          <div className={styles.stepGrid}>
            {steps.map(step => (
              <div key={step.num} className={styles.stepCard} data-num={step.num}>
                <div className={styles.stepIcon}>{step.icon}</div>
                <div className={styles.stepNumLabel}>Step {step.num}</div>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepDesc}>{step.desc}</div>
                <div className={styles.stepTip}>
                  {step.tipLabel ? <strong>{step.tipLabel} </strong> : null}
                  {step.tip}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.sectionAlt}>
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Verification</div>
          <h2 className={styles.sectionTitle}>
            Every vendor is <em>verified.</em>
          </h2>
          <p className={styles.sectionSub}>
            Organisers trust Pitch because every vendor passes our three-point
            verification process before they can apply to a single event.
          </p>
          <div className={styles.trustGrid}>
            {TRUST_CARDS.map(card => (
              <div key={card.title} className={styles.trustCard}>
                <div className={styles.trustIcon}>{card.icon}</div>
                <div className={styles.trustTitle}>{card.title}</div>
                <div className={styles.trustDesc}>{card.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.section} style={{ paddingBottom: 100 }}>
        <div style={{ marginBottom: 48, textAlign: 'center' }}>
          <div className={styles.sectionLabel}>FAQ</div>
          <h2 className={styles.sectionTitle}>Common questions</h2>
        </div>
        <div className={styles.faq}>
          {faqs.map((faq, index) => {
            const isOpen = openFaqIndex === index
            return (
              <div
                key={faq.q}
                className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}
              >
                <button
                  type="button"
                  className={styles.faqBtn}
                  onClick={() => handleFaqToggle(index)}
                  aria-expanded={isOpen}
                >
                  {faq.q}
                  <span className={styles.faqChevron}>+</span>
                </button>
                <div className={styles.faqBody}>
                  <div>{faq.a}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.ctaWrap}>
        {isVendorsTab ? (
          <>
            <h2 className={styles.ctaTitle}>
              Ready to find your <em>pitch?</em>
            </h2>
            <p className={styles.ctaSub}>
              Join vendors and organisers already using Pitch across Australia.
            </p>
            <div className={styles.ctaBtns}>
              <Link href={ROUTES.SIGNUP_VENDOR} className={styles.ctaPrimary}>
                Join as a Vendor
              </Link>
              <Link href={ROUTES.EVENTS} className={styles.ctaSecondary}>
                Browse Events
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.ctaTitle}>
              Ready to fill your <em>lineup?</em>
            </h2>
            <p className={styles.ctaSub}>
              Join organisers already using Pitch to find verified food vendors
              across Australia.
            </p>
            <div className={styles.ctaBtns}>
              <Link href={ROUTES.SIGNUP_ORGANISER} className={styles.ctaPrimary}>
                Post an Event →
              </Link>
              <Link href={ROUTES.VENDORS} className={styles.ctaSecondary}>
                Browse Vendors
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
