// Small chrome/UI icon set, replacing OS-inconsistent emoji glyphs
// (☰ ✕ ← → ⚠ 🧰 and the weather emoji) with currentColor inline SVGs —
// same style as LeafAccent.tsx: no icon-library dependency, colored by the
// caller via a text-(--token) className. Weather icons deliberately share
// one cloud base (built from overlapping circles, not hand-derived bezier
// paths — forgiving shapes that stay recognizable without visual QA) so the
// whole set reads as one family with different accessories, rather than
// eight unrelated glyphs.

type IconProps = { className?: string };

export function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </g>
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </g>
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 3l10 18H2L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <line x1="12" y1="10" x2="12" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16" />
        <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
        <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      </g>
    </svg>
  );
}

export function EquipmentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="9" width="18" height="11" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <line x1="3" y1="13.5" x2="21" y2="13.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CloudBase() {
  return (
    <g fill="currentColor">
      <circle cx="9" cy="9" r="3.5" />
      <circle cx="14" cy="8" r="4" />
      <rect x="6" y="9" width="13" height="5" rx="2.5" />
    </g>
  );
}

export function WeatherSunIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="23" />
        <line x1="1" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="23" y2="12" />
        <line x1="4.2" y1="4.2" x2="6.3" y2="6.3" />
        <line x1="17.7" y1="17.7" x2="19.8" y2="19.8" />
        <line x1="4.2" y1="19.8" x2="6.3" y2="17.7" />
        <line x1="17.7" y1="6.3" x2="19.8" y2="4.2" />
      </g>
    </svg>
  );
}

export function WeatherPartlyCloudyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <g fill="currentColor">
        <circle cx="13" cy="14" r="3" />
        <circle cx="17" cy="13" r="3.5" />
        <rect x="10" y="14" width="11" height="5" rx="2.5" />
      </g>
    </svg>
  );
}

export function WeatherCloudIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <CloudBase />
    </svg>
  );
}

export function WeatherFogIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <CloudBase />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="4" y1="17" x2="20" y2="17" />
        <line x1="6" y1="20" x2="18" y2="20" />
      </g>
    </svg>
  );
}

export function WeatherDrizzleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <CloudBase />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="9" y1="17" x2="9" y2="19" />
        <line x1="13" y1="17" x2="13" y2="19" />
        <line x1="17" y1="17" x2="17" y2="19" />
      </g>
    </svg>
  );
}

export function WeatherRainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <CloudBase />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="8" y1="16" x2="6" y2="21" />
        <line x1="13" y1="16" x2="11" y2="21" />
        <line x1="18" y1="16" x2="16" y2="21" />
      </g>
    </svg>
  );
}

export function WeatherSnowIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <CloudBase />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="9" y1="16" x2="9" y2="20" />
        <line x1="7" y1="18" x2="11" y2="18" />
        <line x1="16" y1="16" x2="16" y2="20" />
        <line x1="14" y1="18" x2="18" y2="18" />
      </g>
    </svg>
  );
}

export function WeatherThunderstormIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <CloudBase />
      <path d="M13 15l-3 5h3l-1 4 4-6h-3l1-3z" fill="currentColor" />
    </svg>
  );
}
