// Shared framer-motion variants + easing. Keep motion subtle and consistent.
// Every consumer also calls useReducedMotion() and disables animation when set
// (this mirrors the prefers-reduced-motion guard in globals.css).

import type { Variants, Transition } from 'framer-motion';

// Gentle "ease-out-expo"-ish curve for entrances.
export const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1];

// Grid container: stagger its children's entrance on first paint.
export const gridContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

// A card / list item rising + fading into place.
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

// Soft spring for hover lift.
export const hoverSpring: Transition = { type: 'spring', stiffness: 380, damping: 28 };
