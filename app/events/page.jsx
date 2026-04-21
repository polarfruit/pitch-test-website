import { Suspense } from 'react'
import { fetchAllPublishedEvents } from '@/lib/data/events'
import EventsPage from '@/components/events/EventsPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Events — Pitch.',
  description: 'Browse upcoming food markets and events across South Australia.',
}

export default async function EventsRoute() {
  const events = await fetchAllPublishedEvents()

  return (
    <main className="page-main">
      <Navbar />
      <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--coal)' }} />}>
        <EventsPage events={events} />
      </Suspense>
      <Footer />
    </main>
  )
}
