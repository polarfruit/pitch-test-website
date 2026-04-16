import styles from './TrustSection.module.css'

const PILLARS = [
  {
    icon: '\uD83C\uDFDB\uFE0F',
    title: 'ABN Verified',
    desc: 'Every vendor\u2019s Australian Business Number is confirmed with the ATO before their profile goes live \u2014 no unregistered operators on Pitch.',
  },
  {
    icon: '\uD83C\uDF7D\uFE0F',
    title: 'Food Safety Certified',
    desc: 'We check that vendors hold a current food safety supervisor certificate and that their local council registration is up to date.',
  },
  {
    icon: '\uD83D\uDEE1\uFE0F',
    title: '$10M Public Liability Insured',
    desc: 'All vendors must provide proof of at least $10 million in public liability insurance \u2014 the standard requirement for Australian events.',
  },
]

export default function TrustSection() {
  return (
    <div className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.heading}>
          Every vendor is <em>verified.</em>
        </h2>
        <p className={styles.sub}>
          Organisers trust Pitch because every vendor on the platform has passed our three-point verification process before they can apply to a single event.
        </p>

        <div className={styles.cols}>
          {PILLARS.map((p) => (
            <div key={p.title} className={styles.card}>
              <div className={styles.iconWrap}>{p.icon}</div>
              <div className={styles.cardTitle}>{p.title}</div>
              <div className={styles.cardDesc}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
