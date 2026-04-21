import HowItWorksPage from '@/components/public/HowItWorksPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'How It Works — Pitch. | Vendor & Organiser Guide',
  description:
    'How Pitch. connects verified food vendors with event organisers across Australia — step by step, for both sides.',
}

export default function HowItWorksRoute() {
  return (
    <main className="page-main">
      <Navbar />
      <HowItWorksPage />
      <Footer />
    </main>
  )
}
