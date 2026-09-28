import { cn } from '@/lib/cn';
import type { Ornament as OrnamentKind } from './themes';

/**
 * The divider under the invitation's opening lines: a zari zig-zag, a
 * marigold garland, a plain line or a lotus. Drawn in the theme's colour.
 */
export function Ornament({ kind, className }: { kind: OrnamentKind; className?: string }) {
  if (kind === 'none') return null;
  // The zig-zag and line are a slim border; the garland and lotus need room.
  const common = { className: cn(kind === 'zari' || kind === 'line' ? 'h-2.5' : 'h-6', className), 'aria-hidden': true as const, focusable: false as const };
  if (kind === 'line') {
    return (
      <svg {...common} viewBox="0 0 320 8" preserveAspectRatio="none">
        <rect x="0" y="3.5" width="320" height="1" fill="var(--c-ornament)" />
        <circle cx="160" cy="4" r="3" fill="var(--c-ornament)" />
      </svg>
    );
  }
  if (kind === 'lotus') {
    return (
      <svg {...common} viewBox="0 0 320 28">
        <rect x="0" y="22" width="120" height="1" fill="var(--c-ornament)" />
        <rect x="200" y="22" width="120" height="1" fill="var(--c-ornament)" />
        <g fill="none" stroke="var(--c-ornament)" strokeWidth="1.6">
          <path d="M160 24 C150 16 150 8 160 2 C170 8 170 16 160 24 Z" />
          <path d="M160 24 C146 22 138 14 136 8 C148 8 156 14 160 24 Z" />
          <path d="M160 24 C174 22 182 14 184 8 C172 8 164 14 160 24 Z" />
        </g>
      </svg>
    );
  }
  if (kind === 'marigold') {
    // A garland: marigolds with a leaf between each.
    const flowers = Array.from({ length: 11 }, (_, i) => 16 + i * 28.8);
    return (
      <svg {...common} viewBox="0 0 320 24">
        <path d="M0 6 Q160 26 320 6" fill="none" stroke="#15803d" strokeWidth="1.2" />
        {flowers.map((x, i) => {
          const y = 6 + 20 * (1 - ((x - 160) / 160) ** 2) * 0.5;
          return (
            <g key={x}>
              <circle cx={x} cy={y} r="6" fill={i % 2 ? '#f59e0b' : '#ea580c'} />
              <circle cx={x} cy={y} r="2.2" fill="#fde68a" />
            </g>
          );
        })}
      </svg>
    );
  }
  // The zari zig-zag of the printed patrika.
  return (
    <svg {...common} viewBox="0 0 320 12" preserveAspectRatio="none">
      <path d={`M0 11 ${Array.from({ length: 16 }, (_, i) => `L${i * 20 + 10} 2 L${i * 20 + 20} 11`).join(' ')} Z`} fill="var(--c-ornament)" />
      <rect x="0" y="10.5" width="320" height="1.5" fill="var(--c-ornament)" />
    </svg>
  );
}
