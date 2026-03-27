import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // API_URL is a server-side runtime env var — set in docker-compose or .env.local
    // Falls back to localhost for local dev without Docker
    const apiUrl = process.env.API_URL || 'http://localhost:5000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${apiUrl}/health`,
      },
      {
        source: '/metrics',
        destination: `${apiUrl}/metrics`,
      },
    ]
  },
};

export default nextConfig;
