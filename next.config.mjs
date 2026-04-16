/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'placehold.co' },
    ],
  },

  async rewrites() {
    const express = process.env.EXPRESS_URL || 'http://localhost:3000'

    return {
      beforeFiles: [
        { source: '/fonts/:path*', destination: `${express}/fonts/:path*` },
        { source: '/brand_assets/:path*', destination: `${express}/brand_assets/:path*` },
        { source: '/data.js', destination: `${express}/data.js` },
        { source: '/suburbs.js', destination: `${express}/suburbs.js` },
        { source: '/location-autocomplete.js', destination: `${express}/location-autocomplete.js` },
        { source: '/favicon.ico', destination: `${express}/favicon.ico` },
        { source: '/favicon.png', destination: `${express}/favicon.png` },
        { source: '/apple-touch-icon.png', destination: `${express}/apple-touch-icon.png` },
      ],
      afterFiles: [
        // API
        { source: '/api/:path*', destination: `${express}/api/:path*` },

        // Pages — browsing
        { source: '/events', destination: `${express}/events` },
        { source: '/events/:path*', destination: `${express}/events/:path*` },
        { source: '/vendors', destination: `${express}/vendors` },
        { source: '/vendors/:path*', destination: `${express}/vendors/:path*` },
        { source: '/organisers/:path*', destination: `${express}/organisers/:path*` },
        { source: '/discover', destination: `${express}/discover` },

        // Pages — dashboards
        { source: '/dashboard/:path*', destination: `${express}/dashboard/:path*` },
        { source: '/admin', destination: `${express}/admin` },
        { source: '/admin/:path*', destination: `${express}/admin/:path*` },

        // Pages — auth
        { source: '/login', destination: `${express}/login` },
        { source: '/signup', destination: `${express}/signup` },
        { source: '/signup/:path*', destination: `${express}/signup/:path*` },
        { source: '/forgot-password', destination: `${express}/forgot-password` },
        { source: '/verify/:path*', destination: `${express}/verify/:path*` },
        { source: '/logout', destination: `${express}/logout` },

        // Pages — info
        { source: '/pricing', destination: `${express}/pricing` },
        { source: '/how-it-works', destination: `${express}/how-it-works` },
        { source: '/about', destination: `${express}/about` },
        { source: '/contact', destination: `${express}/contact` },
        { source: '/terms', destination: `${express}/terms` },
        { source: '/privacy', destination: `${express}/privacy` },

        // Misc
        { source: '/cal/:path*', destination: `${express}/cal/:path*` },
        { source: '/robots.txt', destination: `${express}/robots.txt` },
        { source: '/sitemap.xml', destination: `${express}/sitemap.xml` },
      ],
      fallback: [
        { source: '/:path*', destination: `${express}/:path*` },
      ],
    }
  },
}

export default nextConfig
