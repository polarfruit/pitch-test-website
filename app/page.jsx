import Navbar from '@/components/Navbar'
import HeroSection from '@/components/public/HeroSection'
import StatsBar from '@/components/public/StatsBar'
import ThisWeekend from '@/components/public/ThisWeekend'
import EventsNearYou from '@/components/public/EventsNearYou'
import TopVendors from '@/components/public/TopVendors'
import CategoryBrowse from '@/components/public/CategoryBrowse'
import HowItWorks from '@/components/public/HowItWorks'
import TrustSection from '@/components/public/TrustSection'
import Footer from '@/components/Footer'

import { getFeaturedEvents, getThisWeekendEvents, getCategoryCounts } from '@/lib/data/events'
import { getFeaturedVendors } from '@/lib/data/vendors'
import { getPlatformStats } from '@/lib/data/stats'

export default async function HomePage() {
  const [featuredEvents, weekendEvents, categories, vendors, stats] = await Promise.all([
    getFeaturedEvents(),
    getThisWeekendEvents(),
    getCategoryCounts(),
    getFeaturedVendors(),
    getPlatformStats(),
  ])

  return (
    <main style={{ position: 'relative', zIndex: 1 }}>
      <Navbar />
      <HeroSection events={featuredEvents} />
      <StatsBar stats={stats} />
      <ThisWeekend events={weekendEvents} />
      <EventsNearYou events={featuredEvents} />
      <TopVendors vendors={vendors} />
      <CategoryBrowse categories={categories} />
      <HowItWorks />
      <TrustSection />
      <Footer />
    </main>
  )
}
