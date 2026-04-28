interface BotanicalCornerProps {
  flip?: boolean;
}

const ga = (o: number) => `rgba(74,110,36,${o})`;

export function BotanicalCorner({ flip = false }: BotanicalCornerProps) {
  const style: React.CSSProperties = {
    position: 'absolute',
    bottom: flip ? 'auto' : 0,
    top: flip ? 0 : 'auto',
    left: flip ? 'auto' : 0,
    right: flip ? 0 : 'auto',
    transform: flip ? 'rotate(180deg)' : 'none',
    pointerEvents: 'none',
  };

  return (
    <svg viewBox="0 0 155 168" width="155" height="168" fill="none" style={style}>
      <path d="M6,164 C16,130 40,98 72,72 C92,56 116,38 142,22" stroke={ga(0.06)} strokeWidth="4" />
      <path d="M6,164 C16,130 40,98 72,72 C92,56 116,38 142,22" stroke={ga(0.45)} strokeWidth="1.1" />
      <path d="M46,100 C40,82 40,62 48,48" stroke={ga(0.38)} strokeWidth="0.9" />
      <path d="M78,68 C88,58 96,44 98,32" stroke={ga(0.30)} strokeWidth="0.75" />

      <path d="M22,134 Q4,118 8,100 Q20,118 22,134Z" fill={ga(0.32)} />
      <path d="M22,134 Q28,116 8,100 Q16,120 22,134Z" fill={ga(0.16)} />
      <path d="M22,134 L8,100" stroke={ga(0.30)} strokeWidth="0.65" />
      <path d="M17,122 L12,112" stroke={ga(0.20)} strokeWidth="0.5" />
      <path d="M14,116 L10,108" stroke={ga(0.15)} strokeWidth="0.45" />

      <path d="M44,102 Q24,90 28,74 Q42,88 44,102Z" fill={ga(0.28)} />
      <path d="M44,102 Q52,86 28,74 Q38,90 44,102Z" fill={ga(0.14)} />
      <path d="M44,102 L28,74" stroke={ga(0.26)} strokeWidth="0.6" />
      <path d="M39,94 L34,82" stroke={ga(0.18)} strokeWidth="0.45" />

      <path d="M40,76 Q20,66 22,52 Q38,64 40,76Z" fill={ga(0.25)} />
      <path d="M40,76 Q46,60 22,52 Q34,66 40,76Z" fill={ga(0.12)} />
      <path d="M40,76 L22,52" stroke={ga(0.22)} strokeWidth="0.55" />

      <path d="M46,54 Q60,44 68,50 Q58,48 46,54Z" fill={ga(0.22)} />
      <path d="M46,54 Q52,42 68,50 Q56,50 46,54Z" fill={ga(0.11)} />
      <path d="M46,54 L68,50" stroke={ga(0.20)} strokeWidth="0.5" />

      <path d="M74,70 Q56,58 58,44 Q72,58 74,70Z" fill={ga(0.22)} />
      <path d="M74,70 Q80,54 58,44 Q68,58 74,70Z" fill={ga(0.11)} />
      <path d="M74,70 L58,44" stroke={ga(0.20)} strokeWidth="0.55" />

      <path d="M80,68 Q66,56 70,44 Q80,56 80,68Z" fill={ga(0.18)} />
      <path d="M98,32 Q86,22 90,12 Q98,22 98,32Z" fill={ga(0.18)} />
      <path d="M98,32 Q108,22 90,12 Q96,24 98,32Z" fill={ga(0.10)} />
      <path d="M98,32 L90,12" stroke={ga(0.18)} strokeWidth="0.5" />

      <path d="M112,38 Q96,26 100,14 Q112,26 112,38Z" fill={ga(0.18)} />
      <path d="M112,38 Q120,24 100,14 Q108,28 112,38Z" fill={ga(0.09)} />
      <path d="M112,38 L100,14" stroke={ga(0.17)} strokeWidth="0.5" />

      <circle cx="24" cy="130" r="3"   fill={ga(0.38)} />
      <circle cx="20" cy="126" r="2"   fill={ga(0.25)} />
      <circle cx="16" cy="123" r="1.6" fill={ga(0.20)} />
      <circle cx="46" cy="98"  r="2.5" fill={ga(0.32)} />
      <circle cx="42" cy="94"  r="1.7" fill={ga(0.22)} />
      <circle cx="76" cy="66"  r="2.2" fill={ga(0.28)} />
      <circle cx="102" cy="30" r="1.8" fill={ga(0.22)} />
      <circle cx="114" cy="34" r="1.4" fill={ga(0.18)} />

      <path d="M14,130 C18,124 16,119 12,121 C10,125 12,130 14,130" stroke={ga(0.22)} strokeWidth="0.55" />
      <path d="M38,100 C42,94 40,89 36,91 C34,95 36,100 38,100" stroke={ga(0.18)} strokeWidth="0.5" />
      <path d="M72,68 C76,62 74,57 70,59 C68,63 70,68 72,68" stroke={ga(0.15)} strokeWidth="0.45" />

      <circle cx="30" cy="118" r="1"   fill={ga(0.20)} />
      <circle cx="58" cy="82"  r="1"   fill={ga(0.18)} />
      <circle cx="88" cy="50"  r="0.9" fill={ga(0.15)} />
      <circle cx="130" cy="24" r="0.8" fill={ga(0.12)} />
    </svg>
  );
}
