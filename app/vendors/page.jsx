import { Suspense } from 'react'
import { fetchAllPublishedVendors } from '@/lib/data/vendors'
import VendorsPage from '@/components/vendors/VendorsPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Vendors — Pitch.',
  description: 'Browse verified food vendors and mobile kitchens serving events across South Australia.',
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
