// Standalone demo of the verbatim shadcn/Tailwind components, proving the
// Tailwind + shadcn stack works in isolation without touching the main app.
// Visit /ui-demo.
import { HeroDemo } from '@/components/ui/animated-hero-demo';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';

export default function UiDemoPage() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <section className="flex items-center min-h-screen">
        <HeroDemo />
      </section>

      <ContainerScroll
        titleComponent={
          <>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Scroll to reveal
            </p>
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tighter mt-2">
              Every €1 route, mapped.
            </h2>
          </>
        }
      >
        <img
          src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&q=80&auto=format&fit=crop"
          alt="An open road winding through the mountains at golden hour"
          className="h-full w-full object-cover"
        />
      </ContainerScroll>
    </main>
  );
}
