import TermsPage from '@/components/public/TermsPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Terms of Service — Pitch.',
  description:
    'Terms of Service for the Pitch. platform. How vendors, organisers, and foodies use our marketplace.',
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
