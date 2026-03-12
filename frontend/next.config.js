// Strip any surrounding quotes Vercel/CI may inject, then normalize the origin
// (remove a trailing /api so rewrites can append it cleanly).
let envApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3461/api';
try { envApiUrl = decodeURIComponent(envApiUrl); } catch (e) {}
const rawApiUrl = envApiUrl
  .replace(/^["']|["']$/g, '') // strip surrounding quotes
  .replace(/\/$/, '');           // strip trailing slash
const apiOrigin = rawApiUrl.replace(/\/api$/, ''); // strip trailing /api if present

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
      {
        source: '/ws-proxy',
        destination: `${apiOrigin}/`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com https://r2cdn.perplexity.ai; connect-src 'self' ws: wss: http: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          }
        ],
      },
    ];
  },
};

module.exports = nextConfig;
