import { fetchAllPublishedEvents } from '@/lib/data/events'
import EventsPage from '@/components/events/EventsPage'

export const metadata = {
  title: 'Events — Pitch.',
  description: 'Browse upcoming food markets and events across South Australia.',
}

export default async function EventsRoute() {
  const events = await fetchAllPublishedEvents()

  return <EventsPage events={events} />
}
