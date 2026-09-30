import { getOfferFeed } from '@/lib/movacar';
import App from '@/components/App';

// ISR: served as a static page, re-fetched from Movacar in the background
// at most every 10 minutes. (Must be a literal for Next's static analysis;
// keep in sync with REVALIDATE_SECONDS in lib/movacar.ts.)
export const revalidate = 600;

export default async function Page() {
  const feed = await getOfferFeed();
  return <App feed={feed} />;
}
