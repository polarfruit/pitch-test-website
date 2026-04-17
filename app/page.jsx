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

import { fetchFeaturedEvents, fetchThisWeekendEvents, fetchCategoryCounts } from '@/lib/data/events'
import { fetchFeaturedVendors } from '@/lib/data/vendors'

export default async function HomePage() {
  const [featuredEvents, weekendEvents, categories, vendors] = await Promise.all([
    fetchFeaturedEvents(),
    fetchThisWeekendEvents(),
    fetchCategoryCounts(),
    fetchFeaturedVendors(),
  ])

  return (
    <main className="page-main">
      <Navbar />
      <HeroSection events={featuredEvents} />
      <StatsBar />
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
