import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Eurokäfer · €1 Road trips',
  description: 'Shared road-trip planner for Bochum · Hannover · München',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Leaflet CSS for maps */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
