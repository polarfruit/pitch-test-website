import PricingPage from '@/components/public/PricingPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Pricing — Pitch. | Vendor Plans',
  description:
    'Simple, transparent pricing for food vendors on Pitch. Start free and upgrade when you\'re ready — no lock-in, no contracts.',
}

export default function PricingRoute() {
  return (
    <main className="page-main">
      <Navbar />
      <PricingPage />
      <Footer />
    </main>
  )
}
