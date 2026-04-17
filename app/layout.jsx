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
      <body>{children}</body>
    </html>
  )
}
