import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Vendor not found',
}

export default function VendorNotFound() {
  return (
    <main className="page-main">
      <Navbar />
      <section
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '160px 28px 120px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 48,
            letterSpacing: '-0.03em',
            color: 'var(--text-hi)',
            marginBottom: 16,
          }}
        >
          Vendor not found
        </h1>
        <p style={{ color: 'var(--text-mid)', fontSize: 16, marginBottom: 32 }}>
          We could not find a vendor at that address. They may have removed
          their listing, or the link might be incorrect.
        </p>
        <Link
          href={ROUTES.VENDORS}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: 'var(--ember)',
            color: 'var(--parchment)',
            borderRadius: 10,
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Browse all vendors
        </Link>
      </section>
      <Footer />
    </main>
  )
}
