import type { FamilyTree } from '@samaj/shared';
import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Icon, IconButton } from '@/components/ui';
import { CornersIn, House, ZoomIn, ZoomOut } from '@/components/ui/icons';
import { type MessageKey, isMessageKey, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useDisplayName, useLifeLabel } from './life';
import { CARD_H, CARD_W, type ChartPerson, layoutTree } from './tree-layout';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
/** Fitting a big tree on screen never starts smaller than this; "Fit" goes further on request. */
const READABLE_ZOOM = 0.8;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

/** "Grandparents", "Children"… relative to the head of the family the tree is drawn for. */
export function useGenerationLabel() {
  const t = useT();
  return (generation: number) => {
    const key = `tree.gen.${generation}`;
    if (isMessageKey(key)) return t(key as MessageKey);
    return generation < 0 ? t('tree.genUp', { count: -generation }) : t('tree.genDown', { count: generation });
  };
}

/** "Son · adopted · Age 12", as short as it can be on a card. */
export function usePersonLine() {
  const t = useT();
  const life = useLifeLabel();
  return (p: ChartPerson) =>
    [p.isHead ? t('family.headBadge') : t(`relation.${p.relation}`), p.adopted ? t('member.adopted') : null, life(p), p.movedTo ? t('tree.married') : null].filter(Boolean).join(' · ');
}

function PersonCard({ person, focused, matched, onOpen }: { person: ChartPerson; focused: boolean; matched: boolean; onOpen: (p: ChartPerson) => void }) {
  const t = useT();
  const displayName = useDisplayName();
  const line = usePersonLine();
  const family = t('family.title', { name: person.household.headName });
  return (
    <button
      type="button"
      data-person={person.id}
      onClick={() => onOpen(person)}
      aria-label={`${displayName(person)}, ${line(person)}, ${family}`}
      style={{ left: person.x, top: person.y, width: CARD_W, height: CARD_H }}
      className={cn(
        'absolute flex items-center gap-2 rounded-md border px-2 text-left shadow-card transition-shadow duration-150 hover:shadow-raised',
        person.deceased ? 'bg-surface-muted' : 'bg-surface',
        person.movedTo ? 'border-dashed border-line-strong' : person.isHead && person.rootHousehold ? 'border-primary' : 'border-line',
        matched && 'ring-2 ring-zari',
        focused && 'ring-4 ring-focus',
      )}
    >
      <Avatar name={person.name} src={person.photoUrl} size="md" className={cn(person.deceased && 'grayscale')} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="line-clamp-2 text-sm font-semibold break-words text-fg">{displayName(person)}</span>
        <span className="truncate text-xs text-fg-muted">{line(person)}</span>
      </span>
      {person.isHead && <Icon icon={House} size="sm" weight="fill" className="shrink-0 text-primary" />}
    </button>
  );
}

/**
 * The tree as a chart: generations top to bottom, lines from parents to
 * children, partners side by side. Scrolls both ways, drags with a mouse,
 * zooms, and centres on the person asked for (or the family's head).
 */
export function TreeChart({
  tree,
  focusId,
  matches,
  onOpen,
}: {
  tree: FamilyTree;
  focusId: string | null;
  matches: Set<string>;
  onOpen: (p: ChartPerson) => void;
}) {
  const t = useT();
  const generationLabel = useGenerationLabel();
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Zooming keeps the same point in the middle; `pending` carries it across the re-render.
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  const pending = useRef<{ x: number; y: number; smooth: boolean } | null>(null);
  const scrollToPoint = useCallback((point: { x: number; y: number }, z: number, smooth = false) => {
    const el = scroller.current;
    el?.scrollTo({ left: point.x * z - el.clientWidth / 2, top: point.y * z - el.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const zoomTo = useCallback(
    (z: number, point: { x: number; y: number }) => {
      if (z === zoomNow.current) return scrollToPoint(point, z);
      pending.current = { ...point, smooth: false };
      setZoom(z);
    },
    [scrollToPoint],
  );
  useLayoutEffect(() => {
    if (!pending.current) return;
    scrollToPoint(pending.current, zoom, pending.current.smooth);
    pending.current = null;
  }, [zoom, scrollToPoint]);

  const viewCentre = () => {
    const el = scroller.current;
    return el ? { x: (el.scrollLeft + el.clientWidth / 2) / zoom, y: (el.scrollTop + el.clientHeight / 2) / zoom } : { x: 0, y: 0 };
  };
  const centreOf = useCallback(
    (id: string | null | undefined) => {
      const p = layout.people.find((x) => x.id === id);
      return p ? { x: p.x + CARD_W / 2, y: p.y + CARD_H / 2 } : undefined;
    },
    [layout.people],
  );
  const fitZoom = useCallback(() => {
    const el = scroller.current;
    return el && layout.width > 0 ? clamp(Math.min(1, (el.clientWidth - 8) / layout.width)) : 1;
  }, [layout.width]);

  // First view: as large as fits but readable (a wide tree scrolls instead), on the person asked for or the family's head.
  const focusAtStart = useRef(focusId);
  useLayoutEffect(() => {
    const head = layout.people.find((p) => p.rootHousehold && p.isHead);
    zoomTo(Math.max(fitZoom(), READABLE_ZOOM), centreOf(focusAtStart.current) ?? centreOf(head?.id) ?? { x: layout.width / 2, y: 0 });
    // Opened on someone (from their card): make sure the chart itself is on screen.
    if (focusAtStart.current) scroller.current?.scrollIntoView({ block: 'nearest' });
  }, [layout, fitZoom, zoomTo, centreOf]);
  // Someone picked later: glide to them.
  useEffect(() => {
    if (focusId === focusAtStart.current) return;
    focusAtStart.current = null;
    const point = centreOf(focusId);
    if (!point) return;
    scroller.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    scrollToPoint(point, zoomNow.current, true);
  }, [focusId, centreOf, scrollToPoint]);

  // Drag the background to move around (touch screens scroll natively).
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || e.pointerType !== 'mouse' || (e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || !drag.current) return;
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.top - (e.clientY - drag.current.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div>
      <div className="relative">
        <div className="absolute right-2 bottom-2 z-10 flex gap-1 rounded-md border border-line bg-surface p-1 shadow-raised">
          <IconButton icon={ZoomOut} label={t('tree.zoomOut')} onClick={() => zoomTo(clamp(zoom - 0.15), viewCentre())} disabled={zoom <= MIN_ZOOM} />
          <IconButton icon={ZoomIn} label={t('tree.zoomIn')} onClick={() => zoomTo(clamp(zoom + 0.15), viewCentre())} disabled={zoom >= MAX_ZOOM} />
          <IconButton icon={CornersIn} label={t('tree.fit')} onClick={() => zoomTo(fitZoom(), { x: layout.width / 2, y: layout.height / 2 })} />
        </div>
        <div
          ref={scroller}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // No taller than the tree, so a small family isn't a big empty box; clear of the phone's bottom bar when scrolled to.
          style={{ maxHeight: Math.max(240, layout.height * zoom + 2) }}
          className="h-[70dvh] scroll-mb-24 cursor-grab overflow-auto overscroll-contain rounded-md border border-line bg-canvas active:cursor-grabbing md:scroll-mb-4"
        >
          <div className="relative" style={{ width: layout.width, height: layout.height, zoom }}>
            <svg width={layout.width} height={layout.height} className="absolute inset-0" aria-hidden="true">
              <g fill="none" stroke="var(--line-strong)" strokeWidth={1.5}>
                {layout.connectors.map((c, i) => (
                  <path
                    key={i}
                    d={`M${c.x1},${c.y1} V${c.midY} H${c.x2} V${c.y2}`}
                    stroke={c.marriedIn ? 'var(--kumkum)' : undefined}
                    strokeDasharray={c.skips ? '1 5' : c.dashed ? '6 4' : undefined}
                    strokeLinecap={c.skips ? 'round' : undefined}
                  />
                ))}
                {layout.couples.map((c, i) => (
                  <path key={`c${i}`} d={`M${c.x1},${c.y} H${c.x2}`} stroke="var(--zari)" strokeWidth={3} />
                ))}
                {layout.stubs.map((s, i) => (
                  <path key={`s${i}`} d={`M${s.x},${s.y} V${s.y - 24}`} strokeDasharray="3 4" />
                ))}
              </g>
            </svg>
            {layout.rows.map((r) => (
              <div key={r.generation} className="pointer-events-none absolute left-0 w-full" style={{ top: r.y - 34 }}>
                <span
                  className={cn(
                    'sticky left-2 inline-block rounded-full px-3 py-0.5 text-xs font-semibold shadow-card',
                    r.generation === 0 ? 'bg-primary text-on-primary' : 'bg-surface text-fg',
                  )}
                >
                  {generationLabel(r.generation)}
                </span>
              </div>
            ))}
            {layout.people.map((p) => (
              <PersonCard key={p.id} person={p} focused={p.id === focusId} matched={matches.has(p.id)} onOpen={onOpen} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-fg-muted">{t('tree.chartHint')}</p>
    </div>
  );
}
