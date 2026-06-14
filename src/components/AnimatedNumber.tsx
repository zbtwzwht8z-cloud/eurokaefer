'use client';
import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';

type Props = {
  value: number;
  decimals?: number;
  locale?: boolean;   // thousands separators (integers only)
  prefix?: string;
  suffix?: string;
  duration?: number;
};

function format(v: number, decimals: number, locale: boolean): string {
  if (decimals > 0) return v.toFixed(decimals);
  const n = Math.round(v);
  return locale ? n.toLocaleString() : String(n);
}

// Counts from 0 → value on mount and whenever value changes. Writes to the DOM
// node directly (no per-frame React re-render). Honors reduced-motion.
export default function AnimatedNumber({
  value, decimals = 0, locale = false, prefix = '', suffix = '', duration = 0.9,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || duration <= 0) {
      el.textContent = prefix + format(value, decimals, locale) + suffix;
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: EASE_OUT,
      onUpdate(v) { el.textContent = prefix + format(v, decimals, locale) + suffix; },
    });
    return () => controls.stop();
  }, [value, decimals, locale, prefix, suffix, duration, reduce]);

  return <span ref={ref}>{prefix + format(value, decimals, locale) + suffix}</span>;
}
