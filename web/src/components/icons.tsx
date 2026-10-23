// Minimal inline icon set (no icon library dependency).
type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const SearchIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const BookmarkIcon = ({ className = "h-4 w-4", filled = false }: P & { filled?: boolean }) => (
  <svg {...base} className={className} fill={filled ? "currentColor" : "none"}>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);
export const ExternalIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const SparkIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  </svg>
);
export const PlayIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
);
export const PauseIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
export const UnlockIcon = ({ className = "h-3 w-3" }: P) => (
  <svg {...base} className={className}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </svg>
);
export const QuoteIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}>
    <path d="M7 7h4v4c0 3-2 5-4 6M14 7h4v4c0 3-2 5-4 6" />
  </svg>
);
export const MenuIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const CloseIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const GoogleIcon = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
  </svg>
);
export const SpinnerIcon = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" className={`${className} animate-spin`} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
export const BellIcon = ({ className = "h-4 w-4", filled = false }: P & { filled?: boolean }) => (
  <svg {...base} className={className} fill={filled ? "currentColor" : "none"}>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
export const NewsIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2" />
    <path d="M7.5 9h6M7.5 12.5h6M7.5 16h4" />
  </svg>
);
export const PaperIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);
export const CheckIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12.5 10 17 19 7.5" />
  </svg>
);
export const TrashIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);
export const RefreshIcon = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}>
    <path d="M20 11a8 8 0 0 0-14.9-3.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9L20 16m0 4v-4h-4" />
  </svg>
);
