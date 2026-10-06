// Eurokäfer mark: the "ä" — the letter that makes the name — with its two
// dots in signal orange (two stops, or two wheels). Kept in sync with
// src/app/icon.svg (the favicon).
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#16181b" />
      <circle cx="15.1" cy="18.9" r="5.6" fill="none" stroke="#fff" strokeWidth="3.4" />
      <path d="M22.4 12.7v12.8" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="12.6" cy="7.3" r="2.35" fill="#f0521a" />
      <circle cx="19.9" cy="7.3" r="2.35" fill="#f0521a" />
    </svg>
  );
}
