import ContactPage from '@/components/public/ContactPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Contact Us — Pitch. | Get in Touch',
  description:
    'Contact the Pitch. team. Questions about listing your food vendor business, organising an event, or using the platform? We\'re here to help.',
}

export default function ContactRoute() {
  return (
    <main className="page-main">
      <Navbar />
      <ContactPage />
      <Footer />
    </main>
  )
}
