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

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </g>
    </svg>
  );
}

export function ShedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-6h4v6" />
      </g>
    </svg>
  );
}

export function GardenIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 21v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M12 12c0-4 -3-6-7-6 0 4 3 6 7 6z"
        fill="currentColor"
      />
      <path
        d="M12 12c0-4.5 3-7 7-7 0 4.5-3 7-7 7z"
        fill="currentColor"
      />
    </svg>
  );
}

export function JournalIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </g>
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c0.5-0.5 2-2 2-6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </g>
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 12l6 6L20 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DropletIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 3c3.5 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-7 6-11z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScissorsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <line x1="8" y1="7.5" x2="20" y2="18" />
        <line x1="8" y1="16.5" x2="20" y2="6" />
      </g>
    </svg>
  );
}

export function CarrotIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M9 15L19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M9 15c-3-1-6.5.5-7 4 3.5-.5 5-4 4-7z"
        fill="currentColor"
      />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="16" y1="4" x2="19" y2="2" />
        <line x1="18" y1="7" x2="21" y2="6" />
        <line x1="15" y1="2" x2="16" y2="5" />
      </g>
    </svg>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 8a1 1 0 0 1 1-1h2l1.2-2h7.6L17 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 21s7-6.5 7-11.5a7 7 0 0 0-14 0C5 14.5 12 21 12 21z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function FlagIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <line x1="5" y1="3" x2="5" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 4h13l-3 4 3 4H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function WateringCanIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="10" width="11" height="9" rx="1.5" />
        <path d="M9 10V7a2 2 0 0 1 2-2h2" />
        <path d="M13 6l8-1.5" />
        <path d="M13 9l6-1" />
        <path d="M6 6.5c1.5-1 3-1 4.5 0" />
      </g>
    </svg>
  );
}

export function TrowelIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="16" y1="4" x2="9" y2="11" />
        <path d="M9 11c-3.5 1-6 4-6 8 4 0 7-2.5 8-6z" />
      </g>
    </svg>
  );
}

export function ForkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="22" x2="12" y2="12" />
        <line x1="6" y1="2" x2="6" y2="10" />
        <line x1="12" y1="2" x2="12" y2="10" />
        <line x1="18" y1="2" x2="18" y2="10" />
        <path d="M6 10c0 1.5 2.5 2 6 2s6-.5 6-2" />
      </g>
    </svg>
  );
}

export function GlovesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M8 4a2 2 0 0 1 4 0v3a2 2 0 0 1 4 0v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5a2 2 0 0 1 3-1.7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SpadeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="2" x2="12" y2="15" />
        <path d="M9 3.5a3 3 0 0 0 6 0" />
        <path d="M7 15h10l-1.5 5a2 2 0 0 1-2 1.5h-3a2 2 0 0 1-2-1.5z" />
      </g>
    </svg>
  );
}

export function RakeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="14" y1="2" x2="7" y2="13" />
        <line x1="3" y1="13" x2="17" y2="13" />
        <line x1="5" y1="13" x2="4" y2="18" />
        <line x1="9" y1="13" x2="8.5" y2="18" />
        <line x1="13" y1="13" x2="13" y2="18" />
        <line x1="17" y1="13" x2="17.5" y2="18" />
      </g>
    </svg>
  );
}

export function HoeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="3" x2="8" y2="15" />
        <path d="M4 13l4-3 3 3-4 3z" />
      </g>
    </svg>
  );
}

export function WheelbarrowIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 9h9l-2 6H8z" />
        <line x1="18" y1="9" x2="21" y2="4" />
        <line x1="8" y1="15" x2="3" y2="19" />
        <line x1="16" y1="15" x2="20" y2="19" />
        <circle cx="6" cy="20" r="2" />
      </g>
    </svg>
  );
}

export function StorageBoxIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <rect x="3" y="9" width="18" height="11" rx="1" />
        <path d="M3 9l2-4h14l2 4" strokeLinecap="round" />
        <line x1="9" y1="13" x2="15" y2="13" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function MeasuringTapeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="11" cy="13" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M17 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="13" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15.5 14.2c2.5.4 4.5 2.6 4.5 5.3" />
      </g>
    </svg>
  );
}

export function BasketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10h16l-1.5 9.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5z" />
        <path d="M8 10l2-6" />
        <path d="M16 10l-2-6" />
        <line x1="8" y1="14" x2="8.7" y2="18" />
        <line x1="12" y1="14" x2="12" y2="18" />
        <line x1="16" y1="14" x2="15.3" y2="18" />
      </g>
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
