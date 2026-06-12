'use client';
import dynamic from 'next/dynamic';
import type { Chain } from '@/lib/chains';

// Leaflet pulls in `window` and DOM stuff — must be client-only.
const RoutesMapImpl = dynamic(() => import('./RoutesMapImpl'), {
  ssr: false,
  loading: () => <div className="routes-map routes-map-loading" />,
});

type Props = {
  chains: Chain[];
  hoverKey: string | null;
  onSelect: (chain: Chain) => void;
  onHover?: (key: string | null) => void;
};

export default function RoutesMap(props: Props) {
  return <RoutesMapImpl {...props} />;
}
