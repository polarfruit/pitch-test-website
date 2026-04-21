/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'placehold.co' },
    ],
  },

  async rewrites() {
    // next.config.mjs runs at build time before module aliases resolve,
    // so @/lib/config cannot be imported here. This is the only file
    // that reads process.env.EXPRESS_URL directly.
    const expressBaseUrl = process.env.EXPRESS_URL || 'http://localhost:3000'

    return {
      beforeFiles: [
        { source: '/fonts/:path*', destination: `${expressBaseUrl}/fonts/:path*` },
        { source: '/brand_assets/:path*', destination: `${expressBaseUrl}/brand_assets/:path*` },
        { source: '/data.js', destination: `${expressBaseUrl}/data.js` },
        { source: '/suburbs.js', destination: `${expressBaseUrl}/suburbs.js` },
        { source: '/location-autocomplete.js', destination: `${expressBaseUrl}/location-autocomplete.js` },
        { source: '/favicon.ico', destination: `${expressBaseUrl}/favicon.ico` },
        { source: '/favicon.png', destination: `${expressBaseUrl}/favicon.png` },
        { source: '/apple-touch-icon.png', destination: `${expressBaseUrl}/apple-touch-icon.png` },
      ],
      afterFiles: [
        // API
        { source: '/api/:path*', destination: `${expressBaseUrl}/api/:path*` },

        // Pages — browsing
        // /events migrated to Next.js App Router (app/events/page.jsx)
        // /events/[slug] migrated to Next.js App Router (app/events/[slug]/page.jsx)
        // /vendors migrated to Next.js App Router (app/vendors/page.jsx)
        // /vendors/[id] migrated to Next.js App Router (app/vendors/[id]/page.jsx)
        { source: '/organisers/:path*', destination: `${expressBaseUrl}/organisers/:path*` },
        { source: '/discover', destination: `${expressBaseUrl}/discover` },

        // Pages — dashboards
        { source: '/dashboard/:path*', destination: `${expressBaseUrl}/dashboard/:path*` },
        { source: '/admin', destination: `${expressBaseUrl}/admin` },
        { source: '/admin/:path*', destination: `${expressBaseUrl}/admin/:path*` },

        // Pages — auth
        // /login migrated to Next.js App Router (app/login/page.jsx)
        { source: '/signup', destination: `${expressBaseUrl}/signup` },
        { source: '/signup/:path*', destination: `${expressBaseUrl}/signup/:path*` },
        { source: '/forgot-password', destination: `${expressBaseUrl}/forgot-password` },
        { source: '/verify/:path*', destination: `${expressBaseUrl}/verify/:path*` },
        { source: '/logout', destination: `${expressBaseUrl}/logout` },

        // Pages — info
        { source: '/pricing', destination: `${expressBaseUrl}/pricing` },
        { source: '/how-it-works', destination: `${expressBaseUrl}/how-it-works` },
        { source: '/about', destination: `${expressBaseUrl}/about` },
        { source: '/contact', destination: `${expressBaseUrl}/contact` },
        { source: '/terms', destination: `${expressBaseUrl}/terms` },
        { source: '/privacy', destination: `${expressBaseUrl}/privacy` },

        // Misc
        { source: '/cal/:path*', destination: `${expressBaseUrl}/cal/:path*` },
        { source: '/robots.txt', destination: `${expressBaseUrl}/robots.txt` },
        { source: '/sitemap.xml', destination: `${expressBaseUrl}/sitemap.xml` },
      ],
      fallback: [
        { source: '/:path*', destination: `${expressBaseUrl}/:path*` },
      ],
    }
  },
}

export default nextConfig
