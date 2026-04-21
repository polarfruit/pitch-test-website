'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { PRICING_TIERS, COMPARE_SECTIONS, PRICING_FAQ } from './pricingData'
import styles from './PricingPage.module.css'

function CellValue({ cell, isPro }) {
  const columnClass = isPro ? styles.colPro : ''
  if (cell.type === 'yes') {
    return <td className={`${styles.valCol} ${columnClass}`}><span className={styles.iconYes} aria-label="Yes" /></td>
  }
  if (cell.type === 'no') {
    return <td className={`${styles.valCol} ${columnClass}`}><span className={styles.iconNo} aria-label="No" /></td>
  }
  return <td className={`${styles.valCol} ${styles.hasValue} ${columnClass}`}>{cell.value}</td>
}

export default function PricingPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState(null)

  function handleFaqToggle(index) {
    setOpenFaqIndex(previous => (previous === index ? null : index))
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroEyebrow}>Vendor Pricing</div>
        <h1 className={styles.heroHeading}>Grow at your<br />own pace.</h1>
        <p className={styles.heroBody}>
          Start free and upgrade when you&apos;re ready. No lock-in, no
          contracts — just the tools you need to land more events.
        </p>
      </div>

      <div className={styles.foundingBanner}>
        <div className={styles.foundingEyebrow}>Founding Phase — Now Open</div>
        <div className={styles.foundingHeading}>
          Every feature. Free.<br />While we build South Australia&apos;s food vendor community.
        </div>
        <div className={styles.foundingBody}>
          Pitch is in its founding phase. Join now and get full access to
          every feature — the same features listed below — completely free.
          Pricing will be introduced once we reach critical mass. Founding
          members lock in special rates first.
        </div>
        <Link href={ROUTES.SIGNUP_VENDOR} className={styles.foundingCta}>
          Join as a founding member →
        </Link>
      </div>

      <section className={styles.tiersSection}>
        <div className={styles.tiersGrid}>
          {PRICING_TIERS.map(tier => (
            <div
              key={tier.id}
              className={`${styles.planCard} ${tier.featured ? styles.planCardFeatured : ''} ${tier.growthCard ? styles.planCardGrowth : ''}`}
            >
              {tier.badge ? <div className={styles.planBadge}>{tier.badge}</div> : null}
              {tier.foundingLabel ? <div className={styles.foundingLabel}>{tier.foundingLabel}</div> : null}
              <div className={styles.planName}>{tier.name}</div>
              <div className={styles.planTagline}>{tier.tagline}</div>
              <div className={styles.planPrice}>
                {tier.isFree ? (
                  <span className={styles.freeAmount}>{tier.price}</span>
                ) : (
                  <>
                    <span className={styles.priceAmount}>{tier.price}</span>
                    <span className={styles.pricePeriod}>{tier.period}</span>
                  </>
                )}
              </div>
              <div className={styles.planBillingNote}>{tier.billingNote}</div>
              <p className={styles.planDesc}>{tier.desc}</p>
              <Link
                href={tier.ctaHref}
                className={`${styles.planCta} ${tier.ctaVariant === 'primary' ? styles.ctaPrimary : styles.ctaSecondary}`}
              >
                {tier.ctaLabel}
              </Link>
              <ul className={styles.planFeatures}>
                {tier.features.map(feature => (
                  <li key={feature}>
                    <span className={styles.featIcon} aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className={styles.orgNote}>
          Organising an event? Listing on Pitch is always free for organisers.{' '}
          <Link href={ROUTES.SIGNUP_ORGANISER}>List your event →</Link>
        </p>
      </section>

      <section className={styles.compareSection} id="compare">
        <div className={styles.compareHeader}>
          <h2 className={styles.compareHeading}>Compare all features</h2>
          <p className={styles.compareSub}>Every feature, every plan — side by side.</p>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.compareTable}>
            <thead>
              <tr>
                <th></th>
                <th>
                  <span className={styles.thPlanName}>Starter</span>
                  <span className={styles.thPlanPrice}>Free forever</span>
                </th>
                <th className={styles.colPro}>
                  <span className={styles.thPlanName}>Pro</span>
                  <span className={styles.thPlanPrice}>$29/month</span>
                  <span className={styles.thBadge}>Most popular</span>
                </th>
                <th>
                  <span className={styles.thPlanName}>Growth</span>
                  <span className={styles.thPlanPrice}>$79/month</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_SECTIONS.map(section => (
                <Fragment key={section.label}>
                  <tr className={styles.sectionRow}>
                    <td colSpan={4}>{section.label}</td>
                  </tr>
                  {section.rows.map(row => (
                    <tr key={row.feature}>
                      <td className={styles.featCol}>{row.feature}</td>
                      <CellValue cell={row.starter} isPro={false} />
                      <CellValue cell={row.pro} isPro={true} />
                      <CellValue cell={row.growth} isPro={false} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.faqSection}>
        <div className={styles.faqHeader}>
          <h2 className={styles.faqHeading}>Common questions</h2>
        </div>
        {PRICING_FAQ.map((faq, index) => {
          const isOpen = openFaqIndex === index
          return (
            <div
              key={faq.q}
              className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}
            >
              <button
                type="button"
                className={styles.faqQ}
                onClick={() => handleFaqToggle(index)}
                aria-expanded={isOpen}
              >
                {faq.q}
                <span className={styles.faqIcon}>+</span>
              </button>
              <div className={styles.faqA}>
                <div>{faq.a}</div>
              </div>
            </div>
          )
        })}
      </section>

      <div className={styles.ctaBanner}>
        <h2 className={styles.ctaBannerHeading}>
          Ready to find your <em>pitch?</em>
        </h2>
        <p className={styles.ctaBannerBody}>
          Join vendors already using Pitch across Australia.
        </p>
        <div className={styles.ctaButtons}>
          <Link href={ROUTES.SIGNUP_VENDOR} className={styles.ctaBannerPrimary}>
            Get started free
          </Link>
          <a href="#compare" className={styles.ctaBannerSecondary}>
            Compare all features
          </a>
        </div>
      </div>
    </div>
  )
}
