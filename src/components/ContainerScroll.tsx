'use client';
// Adapted from Aceternity's "Container Scroll Animation" (21st.dev) to
// Eurokäfer's design system — no Tailwind. A perspective card that tilts from
// rotateX(18deg) → flat and scales up as it scrolls into view, with the title
// rising. Uses framer-motion (already a dep). Honors prefers-reduced-motion.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

export default function ContainerScroll({
  titleComponent,
  children,
}: {
  titleComponent: ReactNode;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: containerRef });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const scaleRange: [number, number] = isMobile ? [0.8, 0.95] : [1.02, 1];
  const rotate = useTransform(scrollYProgress, [0, 1], [18, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], scaleRange);
  const translate = useTransform(scrollYProgress, [0, 1], [0, -90]);

  return (
    <div
      ref={containerRef}
      style={{
        height: isMobile ? '70vh' : '78vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', padding: '8px 0',
      }}
    >
      <div
        style={{
          width: '100%', position: 'relative',
          perspective: reduce ? undefined : '1000px',
        }}
      >
        {/* Title */}
        <motion.div
          style={{
            translateY: reduce ? 0 : translate,
            maxWidth: 720, margin: '0 auto', textAlign: 'center',
          }}
        >
          {titleComponent}
        </motion.div>

        {/* Tilting card */}
        <motion.div
          style={{
            rotateX: reduce ? 0 : rotate,
            scale: reduce ? 1 : scale,
            transformStyle: 'preserve-3d',
            width: '100%', maxWidth: 1000, marginTop: 16,
            marginLeft: 'auto', marginRight: 'auto',
            height: 'clamp(300px, 52vh, 560px)',
            borderRadius: 'var(--r-xl)',
            border: '1px solid var(--line-strong)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-xl)',
            padding: 10,
            willChange: 'transform',
          }}
        >
          <div
            style={{
              height: '100%', width: '100%',
              borderRadius: 'var(--r-lg)', overflow: 'hidden',
              background: 'var(--surface-2)',
            }}
          >
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
