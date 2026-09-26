/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Prevents slow double-mounting and double websocket reconnections in dev
  swcMinify: true,
  transpilePackages: ['@baffa/shared', '@baffa/engine'],
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || 'https://baffa-z8mz.onrender.com',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://baffa-z8mz.onrender.com',
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '612690398078-h87q1755hjcnutp8148tmhlhav7ufaa5.apps.googleusercontent.com',
  },
};

module.exports = nextConfig;
