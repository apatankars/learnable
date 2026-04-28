import { useEffect, useState } from 'react';

interface Flash {
  id: number;
  text: string;
  color: string;
}

let flashCounter = 0;

interface ResultFlashProps {
  trigger: { points?: number; type: 'correct' | 'wrong' | 'fuzzy' | 'skip'; label?: string } | null;
}

export function ResultFlash({ trigger }: ResultFlashProps) {
  const [flashes, setFlashes] = useState<Flash[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const id = ++flashCounter;
    const text = trigger.type === 'correct'
      ? `+${trigger.points ?? 0} ✓`
      : trigger.type === 'fuzzy' ? `+${trigger.points ?? 0} ~`
      : trigger.type === 'wrong' ? '✗'
      : '→ skip';
    const color = trigger.type === 'correct' ? 'text-leaf-500'
      : trigger.type === 'fuzzy' ? 'text-leaf-400'
      : trigger.type === 'wrong' ? 'text-red-500'
      : 'text-bark-400';
    setFlashes(f => [...f, { id, text, color }]);
    setTimeout(() => setFlashes(f => f.filter(x => x.id !== id)), 1200);
  }, [trigger]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {flashes.map(f => (
        <div
          key={f.id}
          className={`absolute left-1/2 -translate-x-1/2 bottom-24 font-playfair font-bold text-3xl ${f.color} animate-float-up`}
        >
          {f.text}
        </div>
      ))}
    </div>
  );
}
