import { useMemo, useState } from 'react';
import type { ConfusionEdge, CountryEntry } from '../../types';
import countriesData from '../../data/countries.json';

const nameById = new Map((countriesData as CountryEntry[]).map(c => [c.id, c.name]));

interface ConfusionGraphProps {
  confusions: ConfusionEdge[];
  maxNodes?: number;
}

interface Node { id: string; name: string; weight: number; x: number; y: number; angle: number; }
interface Link { aId: string; bId: string; count: number; }

// A constellation-style node-link diagram of which items get mixed up with which.
// Nodes sit on a ring; an edge's thickness/brightness scales with how often that
// pair is confused. Hovering a node isolates its connections.
export function ConfusionGraph({ confusions, maxNodes = 12 }: ConfusionGraphProps) {
  const [hover, setHover] = useState<string | null>(null);

  const { nodes, links, maxCount } = useMemo(() => {
    // Merge directed edges (and prompt types) into undirected pair counts.
    const pairCount = new Map<string, number>();
    const nodeWeight = new Map<string, number>();
    for (const e of confusions) {
      if (e.shownId === e.answeredId) continue;
      const [a, b] = e.shownId < e.answeredId ? [e.shownId, e.answeredId] : [e.answeredId, e.shownId];
      pairCount.set(`${a}|${b}`, (pairCount.get(`${a}|${b}`) ?? 0) + e.count);
      nodeWeight.set(a, (nodeWeight.get(a) ?? 0) + e.count);
      nodeWeight.set(b, (nodeWeight.get(b) ?? 0) + e.count);
    }

    const topIds = [...nodeWeight.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, maxNodes)
      .map(([id]) => id);
    const idSet = new Set(topIds);

    const cx = 260, cy = 210, R = 150;
    const nodes: Node[] = topIds.map((id, i) => {
      const angle = (i / topIds.length) * Math.PI * 2 - Math.PI / 2;
      return {
        id, name: nameById.get(id) ?? id, weight: nodeWeight.get(id) ?? 0, angle,
        x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle),
      };
    });

    const links: Link[] = [];
    let maxCount = 1;
    for (const [key, count] of pairCount) {
      const [a, b] = key.split('|');
      if (!idSet.has(a) || !idSet.has(b)) continue;
      links.push({ aId: a, bId: b, count });
      if (count > maxCount) maxCount = count;
    }
    links.sort((x, y) => x.count - y.count); // draw faint links first

    return { nodes, links, maxCount };
  }, [confusions, maxNodes]);

  if (nodes.length < 2 || links.length === 0) return null;

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const maxWeight = Math.max(...nodes.map(n => n.weight), 1);
  const cx = 260, cy = 210;

  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)',
      padding: '16px 18px 8px', marginBottom: 32,
    }}>
      <div style={{ fontFamily: 'var(--ff-d)', fontSize: 16, color: 'var(--t1)', marginBottom: 2 }}>
        Your confusion map
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--ff-u)', marginBottom: 8 }}>
        Thicker links join the places you mix up most — tap a node to isolate it.
      </div>
      <svg viewBox="0 0 520 430" width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {links.map((l, i) => {
          const a = nodeById.get(l.aId)!, b = nodeById.get(l.bId)!;
          const t = l.count / maxCount;
          const active = !hover || hover === l.aId || hover === l.bId;
          // Bow the edge toward the centre so the links bundle cleanly.
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const ctrlX = mx + (cx - mx) * 0.4, ctrlY = my + (cy - my) * 0.4;
          return (
            <path
              key={i}
              d={`M ${a.x} ${a.y} Q ${ctrlX} ${ctrlY} ${b.x} ${b.y}`}
              fill="none"
              stroke="var(--miss)"
              strokeWidth={1.2 + 4.8 * t}
              strokeLinecap="round"
              opacity={active ? 0.25 + 0.55 * t : 0.06}
              style={{ transition: 'opacity 0.18s' }}
            />
          );
        })}
        {nodes.map(n => {
          const r = 5 + 7 * (n.weight / maxWeight);
          const active = !hover || hover === n.id ||
            links.some(l => (l.aId === n.id && l.bId === hover) || (l.bId === n.id && l.aId === hover));
          const cos = Math.cos(n.angle);
          const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
          const lx = cx + (150 + r + 8) * cos;
          const ly = cy + (150 + r + 8) * Math.sin(n.angle);
          return (
            <g
              key={n.id}
              style={{ cursor: 'pointer', transition: 'opacity 0.18s' }}
              opacity={active ? 1 : 0.25}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(h => (h === n.id ? null : n.id))}
            >
              <circle cx={n.x} cy={n.y} r={r}
                fill={hover === n.id ? 'var(--gold-hi)' : 'var(--olive)'}
                stroke="var(--bg)" strokeWidth={1.5} />
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle"
                fontSize={11} fontFamily="var(--ff-u)"
                fill={hover === n.id ? 'var(--t1)' : 'var(--t2)'}>
                {n.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
