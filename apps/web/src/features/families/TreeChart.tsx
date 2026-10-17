import type { FamilyTree } from '@samaj/shared';
import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Avatar, Icon, IconButton } from '@/components/ui';
import { ArrowsOut, CornersIn, House, UserCircle, X, ZoomIn, ZoomOut } from '@/components/ui/icons';
import { type MessageKey, formatNumber, isMessageKey, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useDisplayName, useLifeLabel } from './life';
import { COMPACT_CARD, type CardSize, type ChartPerson, FULL_CARD, layoutTree } from './tree-layout';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.8;
/** Fitting a big tree on screen never starts smaller than this; "Fit" goes further on request. */
const READABLE_ZOOM = 0.8;
/** A4 landscape, less the margins, at 96 dpi. */
const PRINT_WIDTH = 1040;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

/** Everyone's relation to one person, from kinshipFrom; `viewerIsEgo` when that person is the one looking. */
export type Kin = { map: Map<string, MessageKey>; viewerIsEgo: boolean } | null;

/** "Grandparents", "Children"… relative to the head of the family the tree is drawn for. */
export function useGenerationLabel() {
  const t = useT();
  return (generation: number) => {
    const key = `tree.gen.${generation}`;
    if (isMessageKey(key)) return t(key as MessageKey);
    return generation < 0 ? t('tree.genUp', { count: -generation }) : t('tree.genDown', { count: generation });
  };
}

/** Who someone is: to the chosen person when there is one ("Your काका"), otherwise as their family lists them. */
export function useRelationLabel() {
  const t = useT();
  return (p: ChartPerson, kin: Kin) => {
    const key = kin?.map.get(p.id);
    if (key === 'kin.self') return kin?.viewerIsEgo ? t('member.sheet.you') : t('kin.self');
    // Joined to them some longer way: say so, rather than a relation to someone else.
    if (key) return t(key);
    return p.isHead ? t('family.headBadge') : t(`relation.${p.relation}`);
  };
}

/** "Son · adopted · Age 12", as short as it can be on a card. */
export function usePersonLine() {
  const t = useT();
  const life = useLifeLabel();
  const relation = useRelationLabel();
  return (p: ChartPerson, kin: Kin = null) =>
    [relation(p, kin), p.adopted ? t('member.adopted') : null, p.formerPartner ? t('member.formerBadge') : null, life(p), p.movedTo ? t('tree.married') : null]
      .filter(Boolean)
      .join(' · ');
}

/** Narrow screens get smaller cards, so a couple and their children fit across. */
function useCompact() {
  const query = '(max-width: 640px)';
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const on = () => setCompact(list.matches);
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, []);
  return compact;
}

function PersonCard({
  person,
  kin,
  card,
  focused,
  matched,
  onPath,
  onOpen,
}: {
  person: ChartPerson;
  kin: Kin;
  card: CardSize;
  focused: boolean;
  matched: boolean;
  /** A path is shown: true on it, false off it (faded); null with none. */
  onPath: boolean | null;
  onOpen: (p: ChartPerson) => void;
}) {
  const t = useT();
  const displayName = useDisplayName();
  const line = usePersonLine();
  const family = t('family.title', { name: person.household.headName });
  const compact = card.w < FULL_CARD.w;
  return (
    <button
      type="button"
      data-person={person.id}
      onClick={() => onOpen(person)}
      aria-label={`${displayName(person)}, ${line(person, kin)}, ${family}`}
      style={{ left: person.x, top: person.y, width: card.w, height: card.h }}
      className={cn(
        'absolute flex items-center rounded-md border text-left shadow-card transition-shadow duration-150 hover:shadow-raised print:shadow-none',
        compact ? 'gap-1.5 px-1.5' : 'gap-2 px-2',
        person.deceased ? 'bg-surface-muted' : 'bg-surface',
        person.movedTo ? 'border-dashed border-line-strong' : person.isHead && person.rootHousehold ? 'border-primary' : 'border-line',
        matched && 'ring-2 ring-zari',
        onPath === true && 'ring-2 ring-primary',
        onPath === false && 'opacity-30',
        focused && 'ring-4 ring-focus',
      )}
    >
      <Avatar name={person.name} src={person.photoUrl} size={compact ? 'sm' : 'md'} className={cn(person.deceased && 'grayscale')} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className={cn('line-clamp-2 font-semibold break-words text-fg', compact ? 'text-xs' : 'text-sm')}>{displayName(person)}</span>
        <span className={cn('truncate text-fg-muted', compact ? 'text-[0.65rem]' : 'text-xs')}>{line(person, kin)}</span>
      </span>
      {person.isHead && !compact && <Icon icon={House} size="sm" weight="fill" className="shrink-0 text-primary" />}
    </button>
  );
}

/**
 * The tree as a chart: generations top to bottom, lines from parents to
 * children, partners side by side. Scrolls both ways, drags with a mouse,
 * zooms (buttons, pinch, Ctrl and the wheel), opens full screen, folds
 * branches away, prints on one landscape page, and starts on the viewer
 * (or the person asked for, or the family's head).
 */
export function TreeChart({
  tree,
  kin,
  focusId,
  homeId,
  matches,
  path = null,
  generationLabel: labelOverride,
  onOpen,
  onWhoseChild,
}: {
  tree: FamilyTree;
  kin: Kin;
  focusId: string | null;
  /** The people between two, lit up with the lines joining them; everyone else fades. */
  path?: ReadonlySet<string> | null;
  /** Row labels other than "Parents", "Children"… (the वंशावळ's पिढी 1, 2, 3). */
  generationLabel?: (generation: number) => string;
  /** Where "Back to me" goes, and where the chart starts without a focus: the viewer, else the head. */
  homeId: string | null;
  matches: Set<string>;
  onOpen: (p: ChartPerson) => void;
  /** Their parents aren't set and their family may be edited: ask whose child they are. */
  onWhoseChild?: (person: { id: string; householdId: string }) => void;
}) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const defaultLabel = useGenerationLabel();
  const generationLabel = labelOverride ?? defaultLabel;
  const displayName = useDisplayName();
  const compact = useCompact();
  const card = compact ? COMPACT_CARD : FULL_CARD;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const layout = useMemo(() => layoutTree(tree, collapsed, card), [tree, collapsed, card]);
  const everyone = useMemo(() => new Map(tree.households.flatMap((h) => h.members.map((m) => [m.id, m] as const))), [tree]);
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Zooming keeps a point of the tree at a place on screen (the middle, unless said); `pending` carries it across the re-render.
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  type Anchor = { x: number; y: number; sx?: number; sy?: number };
  const pending = useRef<(Anchor & { smooth: boolean }) | null>(null);
  const scrollToPoint = useCallback((point: Anchor, z: number, smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: point.x * z - (point.sx ?? el.clientWidth / 2), top: point.y * z - (point.sy ?? el.clientHeight / 2), behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const zoomTo = useCallback(
    (z: number, point: Anchor) => {
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
    return el ? { x: (el.scrollLeft + el.clientWidth / 2) / zoomNow.current, y: (el.scrollTop + el.clientHeight / 2) / zoomNow.current } : { x: 0, y: 0 };
  };
  /** The tree point under a place on screen, kept at that place. */
  const pointAt = (clientX: number, clientY: number): Anchor => {
    const el = scroller.current;
    if (!el) return { x: 0, y: 0 };
    const box = el.getBoundingClientRect();
    const sx = clientX - box.left;
    const sy = clientY - box.top;
    return { x: (el.scrollLeft + sx) / zoomNow.current, y: (el.scrollTop + sy) / zoomNow.current, sx, sy };
  };
  const centreOf = useCallback(
    (id: string | null | undefined) => {
      const p = layout.people.find((x) => x.id === id);
      return p ? { x: p.x + layout.card.w / 2, y: p.y + layout.card.h / 2 } : undefined;
    },
    [layout],
  );
  const fitZoom = useCallback(() => {
    const el = scroller.current;
    return el && layout.width > 0 ? clamp(Math.min(1, (el.clientWidth - 8) / layout.width)) : 1;
  }, [layout.width]);

  // First view of each tree: as large as fits but readable (a wide tree scrolls instead), on the person asked for, the viewer, or the head.
  const latest = useRef({ layout, fitZoom, centreOf, homeId });
  latest.current = { layout, fitZoom, centreOf, homeId };
  const focusAtStart = useRef(focusId);
  const glided = useRef(focusId);
  useLayoutEffect(() => {
    const { layout: now, fitZoom: fit, centreOf: centre, homeId: home } = latest.current;
    const head = now.people.find((p) => p.rootHousehold && p.isHead);
    zoomTo(Math.max(fit(), READABLE_ZOOM), centre(focusAtStart.current) ?? centre(home) ?? centre(head?.id) ?? { x: now.width / 2, y: 0 });
    // Opened on someone (from their card): make sure the chart itself is on screen.
    if (focusAtStart.current) scroller.current?.scrollIntoView({ block: 'nearest' });
  }, [tree, card, zoomTo]);

  // Someone picked later: open the branches hiding them, then glide to them.
  const glideTo = useCallback(
    (id: string) => {
      const point = centreOf(id);
      if (!point) {
        const open = new Set(collapsed);
        for (let at = everyone.get(id), i = 0; at && i < 64; i++) {
          if (at.partnerId) open.delete(at.partnerId);
          if (at.parentId) open.delete(at.parentId);
          at = at.parentId ? everyone.get(at.parentId) : undefined;
        }
        if (open.size !== collapsed.size) setCollapsed(open);
        return false;
      }
      scrollToPoint(point, zoomNow.current, true);
      return true;
    },
    [centreOf, scrollToPoint, collapsed, everyone],
  );
  useEffect(() => {
    if (!focusId || focusId === glided.current) return;
    if (!glideTo(focusId)) return;
    glided.current = focusId;
    if (!full) scroller.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusId, glideTo, full]);

  // The browser's own print (or the Print button): the whole tree on one landscape page.
  useEffect(() => {
    let before = 1;
    const onBefore = () => {
      before = zoomNow.current;
      flushSync(() => setZoom(Math.max(0.2, Math.min(1, PRINT_WIDTH / Math.max(1, latest.current.layout.width)))));
    };
    const onAfter = () => setZoom(before);
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
  }, []);

  // Pinch with two fingers, and Ctrl with the wheel (a trackpad's pinch): zoom around the fingers or the pointer.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let pinch: { distance: number; zoom: number } | null = null;
    const between = (e: TouchEvent) => {
      const a = e.touches[0];
      const b = e.touches[1];
      if (!a || !b) return null;
      return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };
    const onStart = (e: TouchEvent) => {
      const m = between(e);
      if (m) pinch = { distance: m.distance, zoom: zoomNow.current };
    };
    const onMove = (e: TouchEvent) => {
      const m = between(e);
      if (!pinch || !m || pinch.distance === 0) return;
      e.preventDefault();
      const z = clamp((pinch.zoom * m.distance) / pinch.distance);
      if (z !== zoomNow.current) zoomTo(z, pointAt(m.x, m.y));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // A wheel notch (100) is about 1.3 times; a trackpad pinch sends many small steps.
      zoomTo(clamp(zoomNow.current * Math.exp(-e.deltaY / 400)), pointAt(e.clientX, e.clientY));
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('wheel', onWheel);
    };
    // pointAt reads only refs.
  }, [zoomTo]);

  // Full screen: the page behind doesn't scroll, the same part of the tree stays in view, and Escape comes back.
  useEffect(() => {
    if (!full) return;
    const centre = viewCentre();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => scrollToPoint(centre, zoomNow.current));
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener('keydown', onKey);
    };
    // Only when going in or out of full screen.
  }, [full]);

  const toggle = (id: string) =>
    setCollapsed((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });

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
  const home = homeId && everyone.has(homeId) ? homeId : (layout.people.find((p) => p.rootHousehold && p.isHead)?.id ?? null);

  return (
    <div
      className={cn(full && 'fixed inset-0 z-50 flex flex-col bg-canvas p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] print:static print:p-0')}
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
      aria-label={full ? t('tree.title') : undefined}
    >
      {full && (
        <div className="flex items-center justify-between gap-2 px-1 pb-2 print:hidden">
          <span className="truncate font-display text-lg font-semibold text-fg">{t('tree.title')}</span>
          <IconButton icon={X} label={t('tree.exitFull')} onClick={() => setFull(false)} />
        </div>
      )}
      <div className={cn('relative', full && 'min-h-0 flex-1')}>
        {/* On a phone the controls below start under the tab bar: full screen is up here too. */}
        {!full && (
          <button
            type="button"
            onClick={() => setFull(true)}
            className="absolute top-2 right-2 z-10 flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-primary shadow-raised sm:hidden print:hidden"
          >
            <Icon icon={ArrowsOut} size="sm" />
            {t('tree.full')}
          </button>
        )}
        <div className="absolute right-2 bottom-2 z-10 flex gap-1 rounded-md border border-line bg-surface p-1 shadow-raised print:hidden">
          {home && <IconButton icon={UserCircle} label={t(home === homeId ? 'tree.toMe' : 'tree.toHead')} onClick={() => glideTo(home)} />}
          <IconButton icon={ZoomOut} label={t('tree.zoomOut')} onClick={() => zoomTo(clamp(zoom - 0.15), viewCentre())} disabled={zoom <= MIN_ZOOM} />
          <IconButton icon={ZoomIn} label={t('tree.zoomIn')} onClick={() => zoomTo(clamp(zoom + 0.15), viewCentre())} disabled={zoom >= MAX_ZOOM} />
          <IconButton icon={CornersIn} label={t('tree.fit')} onClick={() => zoomTo(fitZoom(), { x: layout.width / 2, y: layout.height / 2 })} />
          {!full && <IconButton icon={ArrowsOut} label={t('tree.full')} onClick={() => setFull(true)} />}
        </div>
        <div
          ref={scroller}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // No taller than the tree, so a small family isn't a big empty box; clear of the phone's bottom bar when scrolled to.
          style={full ? undefined : { maxHeight: Math.max(240, layout.height * zoom + 2) }}
          className={cn(
            // One finger scrolls natively; two fingers are a pinch, handled above.
            'cursor-grab touch-pan-x touch-pan-y overflow-auto overscroll-contain rounded-md border border-line bg-canvas active:cursor-grabbing print:h-auto print:max-h-none! print:overflow-visible print:border-0',
            full ? 'h-full' : 'h-[70dvh] scroll-mb-24 md:scroll-mb-4',
          )}
        >
          <div className="relative" style={{ width: layout.width, height: layout.height, zoom }}>
            <svg width={layout.width} height={layout.height} className="absolute inset-0" aria-hidden="true">
              <g fill="none" stroke="var(--line-strong)" strokeWidth={1.5}>
                {layout.connectors.map((c, i) => {
                  const lit = path ? path.has(c.to) && (path.has(c.from) || (c.other !== undefined && path.has(c.other))) : null;
                  return (
                    <path
                      key={i}
                      d={`M${c.x1},${c.y1} V${c.midY} H${c.x2} V${c.y2}`}
                      stroke={lit ? 'var(--primary)' : c.marriedIn ? 'var(--kumkum)' : undefined}
                      strokeWidth={lit ? 3 : undefined}
                      opacity={lit === false ? 0.25 : undefined}
                      strokeDasharray={c.skips ? '1 5' : c.dashed ? '6 4' : undefined}
                      strokeLinecap={c.skips ? 'round' : undefined}
                    />
                  );
                })}
                {layout.couples.map((c, i) => {
                  const lit = path ? path.has(c.a) && path.has(c.b) : null;
                  return (
                    <path
                      key={`c${i}`}
                      d={c.path}
                      stroke={lit ? 'var(--primary)' : c.former ? 'var(--line-strong)' : 'var(--zari)'}
                      strokeWidth={c.former && !lit ? 1.5 : 3}
                      opacity={lit === false ? 0.25 : undefined}
                      strokeDasharray={c.former ? '4 4' : undefined}
                    />
                  );
                })}
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
              <PersonCard key={p.id} person={p} kin={kin} card={layout.card} focused={p.id === focusId} matched={matches.has(p.id)} onPath={path ? path.has(p.id) : null} onOpen={onOpen} />
            ))}
            {onWhoseChild &&
              layout.stubs
                .filter((s) => tree.households.some((h) => h.family.id === s.householdId && h.canEdit))
                .map((s) => (
                  <button
                    key={`w${s.id}`}
                    type="button"
                    onClick={() => onWhoseChild(s)}
                    title={t('tree.whoseChild')}
                    aria-label={t('tree.whoseChildOf', { name: displayName(everyone.get(s.id) ?? { name: '', deceased: false }) })}
                    style={{ left: s.x, top: s.y - 36 }}
                    className="absolute flex h-6 -translate-x-1/2 items-center gap-1 rounded-full border border-dashed border-primary bg-surface px-2 text-xs font-semibold text-primary hover:bg-primary-soft print:hidden"
                  >
                    ? {t('tree.whoseChild')}
                  </button>
                ))}
            {layout.toggles.map((g) => {
              const name = displayName(everyone.get(g.id) ?? { name: '', deceased: false });
              return (
                <button
                  key={`t${g.id}`}
                  type="button"
                  onClick={() => toggle(g.id)}
                  aria-expanded={!g.collapsed}
                  aria-label={g.collapsed ? t('tree.expand', { count: formatNumber(g.hidden, language), name }) : t('tree.collapse', { name })}
                  title={g.collapsed ? t('tree.expand', { count: formatNumber(g.hidden, language), name }) : t('tree.collapse', { name })}
                  style={{ left: g.x, top: g.y }}
                  className={cn(
                    'absolute flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full border border-line-strong bg-surface px-1.5 text-xs font-semibold text-fg-muted hover:text-fg print:hidden',
                    g.collapsed && 'border-primary text-primary',
                  )}
                >
                  {g.collapsed ? `+${formatNumber(g.hidden, language)}` : '−'}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {!full && <p className="mt-2 text-xs text-fg-muted print:hidden">{t('tree.chartHint')}</p>}
    </div>
  );
}
