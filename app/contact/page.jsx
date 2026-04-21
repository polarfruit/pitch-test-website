import ContactPage from '@/components/public/ContactPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Contact Us | Get in Touch',
  description:
    'Contact the Pitch. team. Questions about listing your food vendor business, organising an event, or using the platform? We\'re here to help.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact Us — Pitch.',
    description:
      'Contact the Pitch. team. Questions about listing your food vendor business, organising an event, or using the platform?',
    url: 'https://onpitch.com.au/contact',
    siteName: 'Pitch.',
    type: 'website',
  },
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
