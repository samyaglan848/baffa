/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Prevents slow double-mounting and double websocket reconnections in dev
  swcMinify: true,
  transpilePackages: ['@baffa/shared', '@baffa/engine'],
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || 'https://baffa-z8mz.onrender.com',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://baffa-z8mz.onrender.com',
  },
};

module.exports = nextConfig;
