'use client';
// Adapted from Aceternity's AuroraBackground (21st.dev). Same API, but the
// effect is backed by a robust CSS class (.aurora-bg in globals.css) instead of
// a stack of arbitrary Tailwind utilities + dark: media variants, which are
// fragile under this project's setup (Tailwind v4, Preflight skipped, forced
// dark). Renders an animated aurora behind its children.
import { cn } from '@/lib/utils';
import type { ReactNode, HTMLAttributes } from 'react';

interface AuroraBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export function AuroraBackground({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) {
  return (
    <section className={cn('aurora-hero', className)} {...props}>
      <div className={cn('aurora-bg', !showRadialGradient && 'aurora-bg-full')} aria-hidden />
      {children}
    </section>
  );
}

export default AuroraBackground;
