const ga = (o: number) => `rgba(74,110,36,${o})`;

export function BotanicalDivider() {
  return (
    <svg viewBox="0 0 260 14" width="260" height="14" fill="none">
      <line x1="0" y1="7" x2="102" y2="7" stroke={ga(0.30)} strokeWidth="0.8" />
      <path d="M118,7 C114,3 116,0 122,1 C118,2 115,5 118,7Z" fill={ga(0.30)} />
      <path d="M118,7 C114,11 116,14 122,13 C118,12 115,9 118,7Z" fill={ga(0.22)} />
      <rect x="126" y="4.5" width="5" height="5" rx="0.5"
        transform="rotate(45 128.5 7)" fill={ga(0.35)} />
      <path d="M142,7 C146,3 144,0 138,1 C142,2 145,5 142,7Z" fill={ga(0.30)} />
      <path d="M142,7 C146,11 144,14 138,13 C142,12 145,9 142,7Z" fill={ga(0.22)} />
      <line x1="158" y1="7" x2="260" y2="7" stroke={ga(0.30)} strokeWidth="0.8" />
      <circle cx="88"  cy="7" r="1.2" fill={ga(0.25)} />
      <circle cx="172" cy="7" r="1.2" fill={ga(0.25)} />
    </svg>
  );
}
