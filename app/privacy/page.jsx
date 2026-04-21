import PrivacyPage from '@/components/public/PrivacyPage'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Privacy Policy — Pitch.',
  description:
    'How Pitch. collects, uses, and protects your personal information under the Australian Privacy Act 1988.',
}

export default function PrivacyRoute() {
  return (
    <main className="page-main">
      <Navbar />
      <PrivacyPage />
      <Footer />
    </main>
  )
}
