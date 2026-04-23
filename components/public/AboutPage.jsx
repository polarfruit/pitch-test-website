import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import styles from './AboutPage.module.css'

const MISSION_STATS = [
  { num: 'SA', label: 'Based in Adelaide' },
  { num: '2026', label: 'Founded this year' },
  { num: 'Free', label: 'During founding phase' },
  { num: 'B2B', label: 'Vendor marketplace' },
]

const VALUES = [
  {
    icon: '📍',
    title: 'Local-first',
    body: 'We built this for Australian food vendors and local event organisers — not for global enterprise marketplaces. Our decisions always prioritise the local food community over growth metrics.',
  },
  {
    icon: '🤝',
    title: 'Transparent',
    body: 'No hidden fees. No surprise deductions. Our pricing is public, our platform fee structure is clear, and we don\'t change the rules on you mid-season. What you see is what you pay.',
  },
  {
    icon: '🌱',
    title: 'Community',
    body: 'Markets are more than commerce — they\'re the places where neighbourhoods connect over food. We\'re here to strengthen that fabric, not extract from it.',
  },
]

const ADELAIDE_TAGS = [
  'Adelaide Central Market',
  'Rundle Mall',
  'Barossa Valley',
  'Adelaide Showground Farmers Market',
  'Semaphore Beach Market',
  'Glenelg Twilight Market',
]

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroLabel}>About Pitch.</div>
        <h1 className={styles.heroHeading}>Built for Australia&apos;s food scene.</h1>
        <p className={styles.heroBody}>
          We&apos;re Adelaide-based, and we built Pitch. because finding the
          right market stall — or the right vendor — was harder than it
          needed to be.
        </p>
      </div>

      <section className={styles.missionSection}>
        <div>
          <h2 className={styles.missionHeading}>Our mission</h2>
          <p className={styles.missionBody}>
            Our mission is to make Australia&apos;s food event market more
            accessible, more transparent, and more community-driven. Every
            market should have the right food vendors. Every vendor should
            have access to the right markets.
          </p>
          <p className={styles.missionBody} style={{ marginTop: 16 }}>
            We believe great food culture is built one stall at a time — and
            the right connections between vendors and organisers are what
            make markets worth going to.
          </p>
        </div>
        <div className={styles.missionStatGrid}>
          {MISSION_STATS.map(stat => (
            <div key={stat.label} className={styles.statCard}>
              <div className={styles.statNum}>{stat.num}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.valuesSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionLabel}>What we stand for</div>
          <h2 className={styles.sectionHeading}>Our values</h2>
        </div>
        <div className={styles.valuesGrid}>
          {VALUES.map(value => (
            <div key={value.title} className={styles.valueCard}>
              <span className={styles.valueIcon}>{value.icon}</span>
              <h3 className={styles.valueTitle}>{value.title}</h3>
              <p className={styles.valueBody}>{value.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.storySection}>
        <div className={styles.sectionLabel}>How we started</div>
        <h2 className={styles.storyHeading}>From a spreadsheet to a platform</h2>
        <p className={styles.storyBody}>
          Pitch. started when a small group of Adelaide food vendors got
          tired of the same chaotic process every market season: emailing
          market coordinators individually, waiting weeks for responses,
          never knowing if their application was even seen. On the organiser
          side, managing dozens of vendor emails from a shared inbox — or
          worse, a spreadsheet — was a nightmare no one had solved.
        </p>
        <p className={styles.storyBody}>
          We started building the platform to fix our own problem — a
          straightforward way for Adelaide food vendors to discover events,
          submit applications, and get matched with the right markets, and
          for organisers to run their vendor selection professionally
          without the admin overhead. Pitch. became the word for the moment
          you put yourself forward. We liked that. We&apos;re in our
          founding phase now, building the platform out with our first
          vendors and organisers.
        </p>
      </section>

      <div className={styles.adelaideSection}>
        <div className={styles.sectionLabel}>Our home</div>
        <h2 className={styles.adelaideHeading}>Why Adelaide?</h2>
        <p className={styles.adelaideBody}>
          Adelaide has one of the most vibrant food market scenes in
          Australia — from the sprawling Rundle Mall weekend markets to the
          artisan growers at Adelaide Central Market, the Barossa Valley
          regional producers, the emerging inner-west food collectives, and
          the summer festival circuit that draws vendors from across SA.
          There&apos;s incredible food culture here. What was missing was
          the infrastructure to support it.
        </p>
        <p className={styles.adelaideBody} style={{ marginTop: 16 }}>
          We started in Adelaide because we know it. And we&apos;re growing
          outward from here — because the same problems that Adelaide
          vendors face exist in every food market across the country.
        </p>
        <div className={styles.adelaideTags}>
          {ADELAIDE_TAGS.map(tag => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
        </div>
      </div>

      <section className={styles.teamSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionLabel}>The team</div>
          <h2 className={styles.sectionHeading}>Who&apos;s behind Pitch.</h2>
        </div>
        <div className={styles.teamGrid}>
          <div className={styles.teamCard}>
            <div className={styles.avatar}>LM</div>
            <h3 className={styles.teamName}>Leroy Morales</h3>
            <div className={styles.teamRole}>Founder</div>
            <p className={styles.teamBody}>
              Adelaide-based and passionate about the local food scene.
              Leroy built Pitch. to solve the disconnect between food
              vendors looking for the right markets and organisers looking
              for the right vendors.
            </p>
          </div>
        </div>
      </section>

      <div className={styles.ctaBanner}>
        <h2 className={styles.ctaHeading}>Join the platform</h2>
        <p className={styles.ctaBody}>
          Whether you&apos;re a vendor, an organiser, or a foodie chasing
          the best local markets — Pitch. was built for you.
        </p>
        <Link href={ROUTES.SIGNUP} className={styles.ctaButton}>
          Get started free
        </Link>
      </div>
    </div>
  )
}
