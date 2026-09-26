/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Prevents slow double-mounting and double websocket reconnections in dev
  swcMinify: true,
  transpilePackages: ['@baffa/shared', '@baffa/engine'],
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || 'https://baffa-z8mz.onrender.com',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://baffa-z8mz.onrender.com',
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '651902823236-u0p9o7grl0ik7p9l37l8jfo5pj8s7oe8.apps.googleusercontent.com',
  },
};

module.exports = nextConfig;
