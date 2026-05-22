'use client';
import dynamic from 'next/dynamic';

// Leaflet pulls in `window` and DOM stuff — must be client-only.
const MapViewImpl = dynamic(() => import('./MapViewImpl'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)' }} />,
});

type Props = { route: string[]; mini?: boolean };

export default function MapView({ route, mini }: Props) {
  return <MapViewImpl route={route} mini={mini} />;
}
