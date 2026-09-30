import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Eurokäfer — €1 camper road trips across Europe',
  description:
    'Every live Movacar relocation, chained into multi-leg road trips and loops. Pick a start city, see where €1 can take you.',
  openGraph: {
    title: 'Eurokäfer — €1 camper road trips across Europe',
    description: 'Every live Movacar relocation, chained into multi-leg road trips and loops.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
