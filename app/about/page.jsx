import AboutPage from '@/components/public/AboutPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'About | Australia\'s Food Vendor Marketplace',
  description:
    'Pitch. is Australia\'s marketplace connecting food vendors with event organisers and foodies. Learn about our mission to make food vending and event booking seamless.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About — Pitch.',
    description:
      'Pitch. is Australia\'s marketplace connecting food vendors with event organisers and foodies.',
    url: 'https://onpitch.com.au/about',
    siteName: 'Pitch.',
    type: 'website',
  },
}

export default function AboutRoute() {
  return (
    <main className="page-main">
      <Navbar />
      <AboutPage />
      <Footer />
    </main>
  )
}
