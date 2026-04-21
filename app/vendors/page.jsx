import { Suspense } from 'react'
import { fetchAllPublishedVendors } from '@/lib/data/vendors'
import VendorsPage from '@/components/vendors/VendorsPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Vendors',
  description: 'Browse verified food vendors and mobile kitchens serving events across South Australia.',
  alternates: { canonical: '/vendors' },
  openGraph: {
    title: 'Vendors — Pitch.',
    description: 'Browse verified food vendors and mobile kitchens serving events across South Australia.',
    url: 'https://onpitch.com.au/vendors',
    siteName: 'Pitch.',
    type: 'website',
  },
}

export default async function VendorsRoute() {
  const vendors = await fetchAllPublishedVendors()

  return (
    <main className="page-main">
      <Navbar />
      <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--coal)' }} />}>
        <VendorsPage vendors={vendors} />
      </Suspense>
      <Footer />
    </main>
  )
}
