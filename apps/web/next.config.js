/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Prevents slow double-mounting and double websocket reconnections in dev
  swcMinify: true,
  transpilePackages: ['@baffa/shared', '@baffa/engine'],
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000',
  },
};

module.exports = nextConfig;
