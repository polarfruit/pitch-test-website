import localFont from 'next/font/local'
import './globals.css'

const fraunces = localFont({
  src: '../fonts/fraunces.woff2',
  variable: '--fd',
  display: 'swap',
  weight: '300 900',
})

const instrumentSans = localFont({
  src: '../fonts/instrument-sans.woff2',
  variable: '--fb',
  display: 'swap',
  weight: '400 700',
})

export const metadata = {
  title: "Pitch. — Australia's Food Vendor & Event Marketplace",
  description:
    'Pitch. connects food vendors, event organisers, and foodies across Australia. Find food trucks, market stalls, and pop-up vendors for your next event — or list your food business and get booked. Based in Adelaide, SA.',
  keywords:
    'food vendors Australia, food truck hire, event catering, market stall vendors, food vendor marketplace, event organisers Australia, Adelaide food vendors',
  authors: [{ name: 'Pitch.' }],
  metadataBase: new URL('https://onpitch.com.au'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: "Pitch. — Australia's Food Vendor & Event Marketplace",
    description:
      'Connect with food vendors, event organisers, and foodies across Australia. Find food trucks, market stalls, and pop-ups for your next event or list your food business.',
    images: ['/brand_assets/pitch-og-image.png'],
    siteName: 'Pitch.',
    locale: 'en_AU',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Pitch. — Australia's Food Vendor & Event Marketplace",
    description:
      'Connect with food vendors, event organisers, and foodies across Australia.',
    images: ['/brand_assets/pitch-og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  other: {
    'geo.region': 'AU-SA',
    'geo.placename': 'Adelaide',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrumentSans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
