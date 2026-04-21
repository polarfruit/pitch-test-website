import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { fetchVendorById, fetchVendorMenu } from '@/lib/data/vendors'
import VendorDetail from '@/components/vendors/VendorDetail'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export async function generateMetadata({ params }) {
  const { id } = await params
  if (!/^\d+$/.test(String(id))) {
    return { title: 'Vendor not found — Pitch.' }
  }
  const vendor = await fetchVendorById(id)
  if (!vendor) return { title: 'Vendor not found — Pitch.' }
  return {
    title: `${vendor.tradingName} — Pitch.`,
    description:
      vendor.bio?.slice(0, 160) ||
      `View menu, photos, and booking info for ${vendor.tradingName} on Pitch.`,
  }
}

export default async function VendorDetailRoute({ params }) {
  const { id } = await params

  if (!/^\d+$/.test(String(id))) notFound()

  const [vendor, menuItems] = await Promise.all([
    fetchVendorById(id),
    fetchVendorMenu(id),
  ])

  if (!vendor) notFound()

  return (
    <main className="page-main">
      <Navbar />
      <Suspense
        fallback={<div style={{ minHeight: '100vh', background: 'var(--coal)' }} />}
      >
        <VendorDetail vendor={vendor} menuItems={menuItems} />
      </Suspense>
      <Footer />
    </main>
  )
}
