export function LeafDivider({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`w-full h-8 text-leaf-300 ${className}`}
      viewBox="0 0 400 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="0" y1="16" x2="160" y2="16" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" />
      <line x1="240" y1="16" x2="400" y2="16" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" />
      {/* Center leaf cluster */}
      <ellipse cx="200" cy="16" rx="6" ry="3" fill="currentColor" opacity="0.6" transform="rotate(-20 200 16)" />
      <ellipse cx="192" cy="14" rx="5" ry="2.5" fill="currentColor" opacity="0.5" transform="rotate(15 192 14)" />
      <ellipse cx="208" cy="14" rx="5" ry="2.5" fill="currentColor" opacity="0.5" transform="rotate(-15 208 14)" />
      <ellipse cx="184" cy="17" rx="4" ry="2" fill="currentColor" opacity="0.35" transform="rotate(25 184 17)" />
      <ellipse cx="216" cy="17" rx="4" ry="2" fill="currentColor" opacity="0.35" transform="rotate(-25 216 17)" />
      {/* Small dots along the line */}
      <circle cx="100" cy="16" r="1.5" fill="currentColor" opacity="0.3" />
      <circle cx="300" cy="16" r="1.5" fill="currentColor" opacity="0.3" />
      <circle cx="60" cy="16" r="1" fill="currentColor" opacity="0.2" />
      <circle cx="340" cy="16" r="1" fill="currentColor" opacity="0.2" />
    </svg>
  );
}
