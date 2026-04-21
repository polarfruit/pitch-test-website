import TermsPage from '@/components/public/TermsPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for the Pitch. platform. How vendors, organisers, and foodies use our marketplace.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Service — Pitch.',
    description:
      'Terms of Service for the Pitch. platform. How vendors, organisers, and foodies use our marketplace.',
    url: 'https://onpitch.com.au/terms',
    siteName: 'Pitch.',
    type: 'website',
  },
}

export default function TermsRoute() {
  return (
    <main className="page-main">
      <Navbar />
      <TermsPage />
      <Footer />
    </main>
  )
}
