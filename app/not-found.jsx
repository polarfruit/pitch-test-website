import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Page not found',
}

export default function NotFound() {
  return (
    <main className="page-main">
      <Navbar />
      <section
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '140px 28px 120px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(120px, 22vw, 220px)',
            lineHeight: 0.95,
            letterSpacing: '-0.05em',
            color: 'var(--ember)',
            marginBottom: 12,
          }}
        >
          404
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(32px, 5vw, 44px)',
            letterSpacing: '-0.03em',
            color: 'var(--text-hi)',
            marginBottom: 14,
          }}
        >
          This pitch doesn&apos;t exist.
        </h1>
        <p
          style={{
            color: 'var(--text-mid)',
            fontSize: 17,
            lineHeight: 1.5,
            marginBottom: 36,
          }}
        >
          The page you&apos;re looking for has moved or never existed.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 20,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href={ROUTES.HOME}
            style={{
              display: 'inline-block',
              padding: '13px 26px',
              background: 'var(--ember)',
              color: 'var(--parchment)',
              borderRadius: 10,
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Back to home →
          </Link>
          <Link
            href={ROUTES.EVENTS}
            style={{
              alignSelf: 'center',
              color: 'var(--text-hi)',
              textDecoration: 'none',
              fontWeight: 600,
              borderBottom: '1px solid var(--text-mid)',
              paddingBottom: 2,
            }}
          >
            Browse events →
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  )
}
