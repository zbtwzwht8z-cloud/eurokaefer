// Standalone demo of the verbatim shadcn/Tailwind component, proving the
// Tailwind + shadcn stack works in isolation without touching the main app.
// Visit /ui-demo.
import { HeroDemo } from '@/components/ui/animated-hero-demo';

export default function UiDemoPage() {
  return (
    <main className="bg-background text-foreground min-h-screen flex items-center">
      <HeroDemo />
    </main>
  );
}
