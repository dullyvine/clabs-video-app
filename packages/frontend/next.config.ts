import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Proxy API requests to backend in production
  // This allows the frontend to make API calls to /api/* which get forwarded to the backend
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/temp/:path*',
        destination: `${backendUrl}/temp/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
