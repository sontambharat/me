/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Media is served via an API route, so allow any host for <img> if needed.
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};

export default nextConfig;
