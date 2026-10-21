/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint is run explicitly via `npm run lint`; don't block production builds on warnings.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
