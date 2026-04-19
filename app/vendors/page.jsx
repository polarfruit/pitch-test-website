import { Suspense } from 'react'
import { fetchAllPublishedVendors } from '@/lib/data/vendors'
import VendorsPage from '@/components/vendors/VendorsPage'

export const metadata = {
  title: 'Vendors — Pitch.',
  description: 'Browse verified food vendors and mobile kitchens serving events across South Australia.',
}

export default async function VendorsRoute() {
  const vendors = await fetchAllPublishedVendors()

  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--coal)' }} />}>
      <VendorsPage vendors={vendors} />
    </Suspense>
  )
}
