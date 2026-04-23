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
        { source: '/favicon.svg', destination: `${expressBaseUrl}/favicon.svg` },
        { source: '/apple-touch-icon.png', destination: `${expressBaseUrl}/apple-touch-icon.png` },
        { source: '/site.webmanifest', destination: `${expressBaseUrl}/site.webmanifest` },
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
        // /signup migrated to Next.js App Router (app/signup/page.jsx)
        // /signup/vendor migrated to Next.js App Router (app/signup/vendor/page.jsx)
        // /signup/organiser migrated to Next.js App Router (app/signup/organiser/page.jsx)
        // Unmigrated subpaths (e.g. /signup/foodie) fall through to Express.
        { source: '/signup/:path*', destination: `${expressBaseUrl}/signup/:path*` },
        // /forgot-password migrated to Next.js App Router (app/forgot-password/page.jsx)
        // /verify/email migrated to Next.js App Router (app/verify/email/page.jsx)
        // /verify/phone still served by Express until a later batch.
        { source: '/verify/:path*', destination: `${expressBaseUrl}/verify/:path*` },
        { source: '/logout', destination: `${expressBaseUrl}/logout` },

        // Pages — info
        // /pricing migrated to Next.js App Router (app/pricing/page.jsx)
        // /how-it-works migrated to Next.js App Router (app/how-it-works/page.jsx)
        // /about migrated to Next.js App Router (app/about/page.jsx)
        // /contact migrated to Next.js App Router (app/contact/page.jsx)
        // /terms migrated to Next.js App Router (app/terms/page.jsx)
        // /privacy migrated to Next.js App Router (app/privacy/page.jsx)

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
