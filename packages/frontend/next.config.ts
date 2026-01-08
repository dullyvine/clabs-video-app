import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Disable server-side body size limits for file uploads
  // The actual limit is handled by the backend (50MB in server.ts)
  serverExternalPackages: [],
  
  // Experimental settings for large file uploads
  experimental: {
    // Allow larger request bodies in server actions
    serverActions: {
      bodySizeLimit: '500mb',
    },
    // Allow larger request bodies through rewrites/proxy (default is 10MB)
    // This replaces middlewareClientMaxBodySize (deprecated)
    proxyClientMaxBodySize: '500mb',
    // Increase proxy timeout for large file uploads (default is 30s)
    proxyTimeout: 120000,
  },
  
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
