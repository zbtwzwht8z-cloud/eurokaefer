'use client';
// Adapted from a shadcn/Tailwind "animated hero" (21st.dev) to Eurokäfer's
// own design system: no Tailwind/shadcn utilities — uses globals.css tokens
// (Fraunces/Inter, --accent/--spark/--ink) + framer-motion (already a dep)
// + lucide-react icons. Same rotating-word spring as the original.
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MoveRight, Compass } from 'lucide-react';

type Props = {
  onBrowse?: () => void;
  onHowItWorks?: () => void;
};

export default function AnimatedHero({ onBrowse, onHowItWorks }: Props) {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ['spontaneous', 'unforgettable', 'practically free', 'wide-open', 'yours'],
    [],
  );
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return; // honor prefers-reduced-motion: hold on the first word
    const timeoutId = setTimeout(() => {
      setTitleNumber(n => (n === titles.length - 1 ? 0 : n + 1));
    }, 2200);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles, reduce]);

  return (
    <section style={{ width: '100%' }}>
      <div
        className="container"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 32, textAlign: 'center',
          padding: 'clamp(56px, 9vw, 120px) 0',
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onHowItWorks}
          style={{ gap: 10 }}
        >
          How €1 relocations work <MoveRight size={16} aria-hidden />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 className="h-display" style={{ maxWidth: 760, margin: '0 auto' }}>
            <span style={{ color: 'var(--ink)' }}>Your next road trip is</span>
            <span
              style={{
                position: 'relative', display: 'flex', width: '100%',
                justifyContent: 'center', overflow: 'hidden',
                minHeight: '1.18em', paddingBottom: '0.12em', marginTop: 2,
              }}
            >
              &nbsp;
              {titles.map((title, index) => (
                <motion.span
                  key={index}
                  style={{ position: 'absolute', fontWeight: 600, color: 'var(--spark)' }}
                  initial={{ opacity: 0, y: '-100%' }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 50 }}
                  animate={
                    titleNumber === index
                      ? { y: 0, opacity: 1 }
                      : { y: titleNumber > index ? -150 : 150, opacity: 0 }
                  }
                >
                  {title}
                </motion.span>
              ))}
            </span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(17px, 1.4vw, 20px)', lineHeight: 1.6,
              color: 'var(--ink-3)', maxWidth: 620, margin: '0 auto',
            }}
          >
            €1 camper relocations, chained into real journeys across Europe.
            We fetch every Movacar listing and work out every trip you can
            actually drive — loops, one-ways, and everything from home.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn btn-ghost" onClick={onHowItWorks} style={{ gap: 10 }}>
            How it works <Compass size={18} aria-hidden />
          </button>
          <button type="button" className="btn btn-primary" onClick={onBrowse} style={{ gap: 10 }}>
            Browse trips <MoveRight size={18} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

// Named export kept for parity with the original component's API.
export { AnimatedHero as Hero };
