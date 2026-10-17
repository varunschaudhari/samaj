import type { ChartLayout } from './tree-layout';

/*
 * The tree as a picture, for a family WhatsApp group: drawn on a canvas from
 * the chart's own layout (the same places, lines and couples), with a heading,
 * in the light colours whatever the phone's theme.
 */

export interface TreeImageText {
  title: string;
  subtitle: string;
  footer: string;
  /** Each person's name and their line ("Son · Age 31"), by id. */
  names: Map<string, string>;
  lines: Map<string, string>;
  rowLabel: (generation: number) => string;
  /** A lit path: its people and lines drawn strong, the rest faded. */
  path?: ReadonlySet<string> | null;
}

const C = { canvas: '#f8f5ee', card: '#ffffff', muted: '#f1ede4', line: '#7a7d74', edge: '#e7e1d4', zari: '#c8911f', kumkum: '#8c2356', primary: '#0b5d57', fg: '#16201f', fgMuted: '#5a5f58', avatar: '#f7ebd2', avatarFg: '#6b4600' };
const BODY = "'Inter Variable', 'Noto Sans Devanagari Variable', 'Noto Sans Devanagari', system-ui, sans-serif";
const DISPLAY = "'Plus Jakarta Sans Variable', 'Mukta', 'Noto Sans Devanagari', system-ui, sans-serif";
const HEADER = 96;
const FOOTER = 40;
/** Pixels per layout pixel, smaller for a very wide tree so the picture stays shareable. */
const MAX_SIDE = 6000;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0] ?? '')
    .join('')
    .toUpperCase();

/** Up to `max` lines of `text` that fit `width`; "…" where it had to be cut. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length && out.length < max) {
    let line = words[i++] as string;
    while (i < words.length && ctx.measureText(`${line} ${words[i]}`).width <= width) line += ` ${words[i++]}`;
    out.push(line);
  }
  const last = out.length - 1;
  if (last >= 0 && (i < words.length || ctx.measureText(out[last] as string).width > width)) {
    let s = out[last] as string;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
    out[last] = `${s}…`;
  }
  return out;
}

export async function drawTreeImage(layout: ChartLayout, text: TreeImageText): Promise<Blob> {
  await Promise.all([`600 28px ${DISPLAY}`, `600 14px ${BODY}`, `400 12px ${BODY}`].map((f) => document.fonts.load(f, text.title).catch(() => [])));
  const width = Math.max(layout.width, 480);
  const height = HEADER + layout.height + FOOTER;
  const scale = Math.min(2, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.scale(scale, scale);
  ctx.fillStyle = C.canvas;
  ctx.fillRect(0, 0, width, height);

  // Heading.
  ctx.textAlign = 'center';
  ctx.fillStyle = C.fg;
  ctx.font = `600 28px ${DISPLAY}`;
  ctx.fillText(text.title, width / 2, 44);
  ctx.fillStyle = C.fgMuted;
  ctx.font = `400 15px ${BODY}`;
  ctx.fillText(text.subtitle, width / 2, 70);
  ctx.fillStyle = C.zari;
  ctx.fillRect(width / 2 - 80, 82, 160, 2);

  ctx.save();
  ctx.translate(0, HEADER);
  const faded = (lit: boolean | null) => (lit === false ? 0.25 : 1);

  // Lines first, under the cards.
  ctx.lineWidth = 1.5;
  for (const c of layout.connectors) {
    const lit = text.path ? text.path.has(c.to) && (text.path.has(c.from) || (c.other !== undefined && text.path.has(c.other))) : null;
    ctx.globalAlpha = faded(lit);
    ctx.strokeStyle = lit ? C.primary : c.marriedIn ? C.kumkum : C.line;
    ctx.lineWidth = lit ? 3 : 1.5;
    ctx.setLineDash(c.skips ? [1, 5] : c.dashed ? [6, 4] : []);
    ctx.stroke(new Path2D(`M${c.x1},${c.y1} V${c.midY} H${c.x2} V${c.y2}`));
  }
  for (const c of layout.couples) {
    const lit = text.path ? text.path.has(c.a) && text.path.has(c.b) : null;
    ctx.globalAlpha = faded(lit);
    ctx.strokeStyle = lit ? C.primary : c.former ? C.line : C.zari;
    ctx.lineWidth = c.former && !lit ? 1.5 : 3;
    ctx.setLineDash(c.former ? [4, 4] : []);
    ctx.stroke(new Path2D(c.path));
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Generation labels at the left of each row.
  ctx.textAlign = 'left';
  for (const r of layout.rows) {
    const label = text.rowLabel(r.generation);
    ctx.font = `600 12px ${BODY}`;
    const w = ctx.measureText(label).width + 20;
    ctx.fillStyle = r.generation === 0 ? C.primary : C.card;
    ctx.beginPath();
    ctx.roundRect(8, r.y - 40, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = r.generation === 0 ? '#ffffff' : C.fg;
    ctx.fillText(label, 18, r.y - 25);
  }

  // Cards.
  const { w, h } = layout.card;
  for (const p of layout.people) {
    const lit = text.path ? text.path.has(p.id) : null;
    ctx.globalAlpha = faded(lit);
    ctx.fillStyle = p.deceased ? C.muted : C.card;
    ctx.strokeStyle = lit ? C.primary : p.isHead && p.rootHousehold ? C.primary : C.edge;
    ctx.lineWidth = lit || (p.isHead && p.rootHousehold) ? 2 : 1;
    ctx.setLineDash(p.movedTo ? [4, 3] : []);
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // Initials in a circle.
    const r = 18;
    const cx = p.x + 8 + r;
    const cy = p.y + h / 2;
    ctx.fillStyle = p.deceased ? '#e5e1d8' : C.avatar;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.deceased ? C.fgMuted : C.avatarFg;
    ctx.font = `600 12px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText(initials(p.name), cx, cy + 4);
    // Name, up to two lines, and their line under it.
    ctx.textAlign = 'left';
    const left = cx + r + 8;
    const room = p.x + w - 8 - left;
    ctx.fillStyle = C.fg;
    ctx.font = `600 13px ${BODY}`;
    const nameLines = fit(ctx, text.names.get(p.id) ?? p.name, room, 2);
    const top = cy - (nameLines.length * 16 + 14) / 2 + 12;
    nameLines.forEach((l, i) => ctx.fillText(l, left, top + i * 16));
    ctx.fillStyle = C.fgMuted;
    ctx.font = `400 11px ${BODY}`;
    ctx.fillText(fit(ctx, text.lines.get(p.id) ?? '', room, 1)[0] ?? '', left, top + nameLines.length * 16 + 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = C.fgMuted;
  ctx.font = `400 12px ${BODY}`;
  ctx.fillText(text.footer, width / 2, height - 16);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}
