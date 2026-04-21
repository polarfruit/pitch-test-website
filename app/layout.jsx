import localFont from 'next/font/local'
import './globals.css'

export { metadata } from './metadata'

const fraunces = localFont({
  src: '../fonts/fraunces.woff2',
  variable: '--font-display',
  display: 'swap',
  weight: '300 900',
})

const instrumentSans = localFont({
  src: '../fonts/instrument-sans.woff2',
  variable: '--font-body',
  display: 'swap',
  weight: '400 700',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrumentSans.variable}`}>
      {/* Coal hex literal so the brand background still paints if the
          layout.css bundle fails to load. globals.css remains the
          source of truth — this is a belt-and-braces fallback. */}
      <body style={{ background: '#1A1612' }}>{children}</body>
    </html>
  )
}
