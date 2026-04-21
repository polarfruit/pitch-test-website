export const metadata = {
  title: {
    default: "Pitch. — Australia's marketplace for food vendors and events",
    template: '%s — Pitch.',
  },
  description:
    'Find your pitch. Connect food vendors with events and markets across South Australia.',
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
