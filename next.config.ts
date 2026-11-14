import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    // When deployed on Vercel with a designated backend API URL (e.g. Render),
    // proxy frontend /api requests to the Render backend service while preserving path structure
    if (apiUrl && !apiUrl.includes("localhost") && !apiUrl.includes("vercel.app")) {
      const cleanApiUrl = apiUrl.replace(/\/+$/, "");
      return [
        {
          source: "/api/:path*",
          destination: `${cleanApiUrl}/api/:path*`,
        },
      ];
    }
    return [];
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: process.env.ALLOWED_ORIGIN || "https://gnaniai404.vercel.app" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          {
            key: "Access-Control-Allow-Headers",
            value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Twilio-Signature",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

