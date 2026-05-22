import { TRIP_DATA } from '@/data/trip-data';
import { getCurrentUser } from '@/lib/auth';
import { getAllHighlights, getAllUsers } from '@/lib/turso';
import EurokaeferApp from '@/components/EurokaeferApp';
import AccessKeyGate from '@/components/AccessKeyGate';

export default async function Page() {
  const user = await getCurrentUser();

  if (!user) {
    return <AccessKeyGate />;
  }

  // Fetch shared state in parallel for the authenticated view
  const [highlights, users] = await Promise.all([
    getAllHighlights().catch(() => []),
    getAllUsers().catch(() => []),
  ]);

  return (
    <EurokaeferApp
      data={TRIP_DATA}
      user={user}
      users={users}
      initialHighlights={highlights}
    />
  );
}
