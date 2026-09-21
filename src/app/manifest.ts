import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/shared/branding';

// アプリ名は BRAND ひとつから引く。.env を変えれば PWA の表示名も変わる。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: '#fbfcfb',
    theme_color: '#087c73',
    lang: 'ja',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
