/** @type {import('next').NextConfig} */
const nextConfig = {
  // Windows development environments may not allow pnpm's symlinked standalone trace.
  // Docker builds keep standalone output; local checks can set NEXT_BUILD_MODE=portable.
  output: process.env.NEXT_BUILD_MODE === 'portable' ? undefined : 'standalone',
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
export default nextConfig;
