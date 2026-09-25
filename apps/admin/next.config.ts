import type { NextConfig } from 'next';
import { securityHeaders } from '../next.shared';

const config: NextConfig = {
  transpilePackages: ['@thippo/core', '@thippo/ui', '@thippo/db', '@thippo/auth'],
  async headers() {
    return [
      {
        source: '/:path*',
        // 運営管理は検索エンジンに載せない
        headers: [...securityHeaders, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default config;
