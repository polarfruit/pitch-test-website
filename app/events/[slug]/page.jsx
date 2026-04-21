import { notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import EventDetail from '@/components/events/EventDetail'
import { fetchEventBySlug, fetchSimilarEvents } from '@/lib/data/events'
import { fetchCurrentUser } from '@/lib/data/user'
import { SIMILAR_EVENTS_COUNT } from '@/constants/limits'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const event = await fetchEventBySlug(slug)
  if (!event) {
    return { title: 'Event not found — Pitch.' }
  }
  const description = (event.description ?? '').slice(0, 160)
  return {
    title: `${event.name} — Pitch.`,
    description: description || `${event.name} in ${event.suburb}, ${event.state}.`,
  }
}

export default async function EventDetailRoute({ params }) {
  const { slug } = await params
  const event = await fetchEventBySlug(slug)
  if (!event) notFound()

  const [user, similarEvents] = await Promise.all([
    fetchCurrentUser(),
    fetchSimilarEvents({
      excludeId: event.id,
      category: event.category,
      limit: SIMILAR_EVENTS_COUNT,
    }),
  ])

  return (
    <main className="page-main">
      <Navbar user={user} />
      <EventDetail event={event} user={user} similarEvents={similarEvents} />
      <Footer />
    </main>
  )
}
