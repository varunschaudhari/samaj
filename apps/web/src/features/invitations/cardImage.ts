/*
 * The invitation card as a picture, for WhatsApp groups and status, where
 * families forward a patrika image rather than a link. Drawn on a canvas
 * from the same content and theme as the on-screen card (the palettes in
 * themes.ts), whatever the phone's light or dark mode.
 */
import type { InvitationTheme } from '@samaj/shared';
import { type Ornament, THEMES, type ThemePalette } from './themes';

export interface CardImageText {
  /** "॥ श्री गणेशाय नमः ॥", or the remembrance line. */
  top: string;
  kind: string;
  forNames: string | null;
  /** In place of forNames when the family filled them in: the name, and whose child and from where. */
  honorees: { name: string; detail: string | null }[];
  /** Between two honorees: "&", "आणि". */
  with: string;
  invites: string;
  functions: { name: string; when: string; venue: string; muhurat: string | null }[];
  message: string | null;
  /** कृपाछत्र, आशीर्वाद, निमंत्रक: a heading and its names. */
  lists: { label: string; names: string[] }[];
  /** The link, or the app's name, at the foot. */
  footer: string;
  /** A personal invitation: "Dear Ramesh". */
  addressee: string | null;
  theme: InvitationTheme;
}

const W = 1080;
const PAD = 72;
const INNER = W - PAD * 2;
const BODY = "'Inter Variable', 'Noto Sans Devanagari Variable', 'Noto Sans Devanagari', system-ui, sans-serif";
const DISPLAY = "'Plus Jakarta Sans Variable', 'Mukta', 'Noto Sans Devanagari', system-ui, sans-serif";

/** Lines of `text` that fit `width`, broken at spaces. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

interface Block {
  font: string;
  color: string;
  text: string;
  lineHeight: number;
  gapBefore: number;
  width?: number;
  align?: CanvasTextAlign;
}

/** The divider under the opening lines, as on the on-screen card. Returns its height. */
function ornament(ctx: CanvasRenderingContext2D, kind: Ornament, color: string, x: number, y: number, width: number) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (kind === 'line') {
    ctx.fillRect(x, y + 11, width, 2);
    ctx.beginPath();
    ctx.arc(x + width / 2, y + 12, 6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === 'lotus') {
    const cx = x + width / 2;
    ctx.fillRect(x, y + 40, width / 2 - 70, 2);
    ctx.fillRect(cx + 70, y + 40, width / 2 - 70, 2);
    ctx.lineWidth = 3;
    for (const [dx, tilt] of [[0, 0], [-1, -0.9], [1, 0.9]] as const) {
      ctx.save();
      ctx.translate(cx + dx * 6, y + 44);
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.ellipse(0, -18, 11, 22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }
  if (kind === 'marigold') {
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.quadraticCurveTo(x + width / 2, y + 48, x + width, y + 8);
    ctx.stroke();
    const n = 11;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const fx = x + t * width;
      const fy = y + 8 + 40 * 2 * t * (1 - t);
      ctx.fillStyle = i % 2 ? '#f59e0b' : '#ea580c';
      ctx.beginPath();
      ctx.arc(fx, fy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(fx, fy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (kind === 'none') return;
  const tooth = 24;
  const start = x + ((width % tooth) / 2);
  ctx.beginPath();
  for (let tx = start; tx + tooth <= x + width; tx += tooth) {
    ctx.moveTo(tx, y + 12);
    ctx.lineTo(tx + tooth / 2, y + 2);
    ctx.lineTo(tx + tooth, y + 12);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x, y + 11, width, 2);
}

/** Draws the card and gives it back as a PNG. */
export async function drawCardImage(card: CardImageText): Promise<Blob> {
  // The canvas only uses fonts the page has loaded.
  await Promise.all([`600 64px ${DISPLAY}`, `400 32px ${BODY}`, `600 32px ${BODY}`].map((f) => document.fonts.load(f, card.forNames ?? card.kind).catch(() => [])));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const P: ThemePalette = THEMES[card.theme];

  // Measure first, with a throwaway height, then draw at the real size.
  const layout = (draw: boolean) => {
    let y = PAD + 40;
    const text = (b: Block) => {
      ctx.font = b.font;
      y += b.gapBefore;
      for (const line of wrap(ctx, b.text, b.width ?? INNER - 40)) {
        y += b.lineHeight;
        if (draw) {
          ctx.fillStyle = b.color;
          ctx.textAlign = b.align ?? 'center';
          ctx.fillText(line, b.align === 'left' ? PAD + 56 : W / 2, y - b.lineHeight * 0.28);
        }
      }
    };
    text({ font: `600 30px ${BODY}`, color: P.top, text: card.top, lineHeight: 44, gapBefore: 16 });
    if (card.addressee) text({ font: `600 34px ${DISPLAY}`, color: P.ink, text: card.addressee, lineHeight: 50, gapBefore: 20 });
    text({ font: `600 40px ${DISPLAY}`, color: P.accent, text: card.kind, lineHeight: 56, gapBefore: 24 });
    if (card.honorees.length) {
      card.honorees.forEach((h, i) => {
        if (i > 0) text({ font: `400 36px ${DISPLAY}`, color: P.muted, text: card.with, lineHeight: 52, gapBefore: 4 });
        text({ font: `700 64px ${DISPLAY}`, color: P.ink, text: h.name, lineHeight: 84, gapBefore: 8 });
        if (h.detail) text({ font: `400 28px ${BODY}`, color: P.muted, text: h.detail, lineHeight: 40, gapBefore: 0, width: INNER - 160 });
      });
    } else if (card.forNames) text({ font: `700 76px ${DISPLAY}`, color: P.ink, text: card.forNames, lineHeight: 96, gapBefore: 12 });
    text({ font: `400 30px ${BODY}`, color: P.muted, text: card.invites, lineHeight: 44, gapBefore: 20, width: INNER - 160 });
    if (P.ornament !== 'none') {
      y += 36;
      if (draw) ornament(ctx, P.ornament, P.ornamentColor, W / 2 - 220, y, 440);
      y += P.ornament === 'zari' || P.ornament === 'line' ? 14 : 50;
    }
    y += 28;
    for (const f of card.functions) {
      const top = y;
      ctx.font = `600 30px ${BODY}`;
      const whenLines = wrap(ctx, f.when, INNER - 112).length;
      const venueLines = wrap(ctx, f.venue, INNER - 112).length;
      const muhuratLines = f.muhurat ? wrap(ctx, f.muhurat, INNER - 112).length : 0;
      const h = 40 + 52 + (whenLines + venueLines + muhuratLines) * 42 + 28;
      if (draw) {
        ctx.fillStyle = P.panel;
        ctx.strokeStyle = P.panelLine;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(PAD + 24, top, INNER - 48, h, 20);
        ctx.fill();
        ctx.stroke();
      }
      y = top + 20;
      // Centred, like the card on screen and a printed patrika.
      text({ font: `600 40px ${DISPLAY}`, color: P.ink, text: f.name, lineHeight: 56, gapBefore: 12, width: INNER - 112 });
      text({ font: `400 30px ${BODY}`, color: P.ink, text: `🗓  ${f.when}`, lineHeight: 42, gapBefore: 6, width: INNER - 112 });
      if (f.muhurat) text({ font: `600 30px ${BODY}`, color: P.highlight, text: `🪷  ${f.muhurat}`, lineHeight: 42, gapBefore: 0, width: INNER - 112 });
      text({ font: `400 30px ${BODY}`, color: P.ink, text: `📍  ${f.venue}`, lineHeight: 42, gapBefore: 0, width: INNER - 112 });
      y = top + h + 20;
    }
    if (card.message) text({ font: `400 32px ${BODY}`, color: P.ink, text: card.message, lineHeight: 48, gapBefore: 16, width: INNER - 120 });
    for (const list of card.lists.filter((l) => l.names.length)) {
      text({ font: `600 24px ${BODY}`, color: P.muted, text: list.label.toUpperCase(), lineHeight: 36, gapBefore: 28 });
      for (const name of list.names) text({ font: `400 30px ${BODY}`, color: P.ink, text: name, lineHeight: 42, gapBefore: 0 });
    }
    text({ font: `400 24px ${BODY}`, color: P.muted, text: card.footer, lineHeight: 36, gapBefore: 40 });
    return y + PAD + 24;
  };

  canvas.width = W;
  canvas.height = 4000;
  const height = layout(false);
  canvas.height = height;
  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, W, height);
  // The theme's frame: doubled where it has an inner line.
  ctx.lineWidth = 4;
  ctx.strokeStyle = P.frame;
  ctx.strokeRect(PAD / 2, PAD / 2, W - PAD, height - PAD);
  if (P.frameInner) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = P.frameInner;
    ctx.strokeRect(PAD / 2 + 12, PAD / 2 + 12, W - PAD - 24, height - PAD - 24);
  }
  layout(true);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}

/**
 * Hands the picture to the phone's share sheet (WhatsApp, Telegram, …) where
 * that can take files; elsewhere it downloads.
 */
export async function shareOrDownload(blob: Blob, filename: string, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      // Closing the share sheet isn't a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
