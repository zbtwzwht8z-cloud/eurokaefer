// Eurokäfer mark: a VW Beetle ("Käfer") silhouette in signal orange on ink.
// Kept in sync with src/app/icon.svg (the favicon).
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#16181b" />
      {/* domed body */}
      <path d="M4.6 21.2c-.4-6.2 4-11.6 11-11.6 4.4 0 7.2 2.4 8.7 5.3 2.7.5 4.3 2.2 4.3 4.9v1.4z" fill="#f0521a" />
      {/* window + pillar */}
      <path d="M9.7 15.4c.9-2.3 3-3.6 5.6-3.6 2.2 0 3.8 1.1 4.9 3.6z" fill="#16181b" />
      <path d="M15.2 11.9v3.5" stroke="#f0521a" strokeWidth="1.3" />
      {/* wheel arches + wheels */}
      <circle cx="10" cy="21.4" r="3.9" fill="#16181b" />
      <circle cx="23.8" cy="21.4" r="3.9" fill="#16181b" />
      <circle cx="10" cy="21.4" r="2.5" fill="#fff" />
      <circle cx="23.8" cy="21.4" r="2.5" fill="#fff" />
    </svg>
  );
}
