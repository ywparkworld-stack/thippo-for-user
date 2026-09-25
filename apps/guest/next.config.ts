import type { NextConfig } from 'next';
import { securityHeaders } from '../next.shared';

const config: NextConfig = {
  transpilePackages: ['@thippo/core', '@thippo/ui', '@thippo/db', '@thippo/auth'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
