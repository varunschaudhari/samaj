/*
 * The invitation card as a picture, for WhatsApp groups and status, where
 * families forward a patrika image rather than a link. Drawn on a canvas
 * from the same content as the on-screen card, always in the light
 * colours (it is a printed-card look, whatever the phone's theme).
 */

export interface CardImageText {
  /** "॥ श्री गणेशाय नमः ॥", or the remembrance line. */
  top: string;
  kind: string;
  forNames: string | null;
  invites: string;
  functions: { name: string; when: string; venue: string }[];
  message: string | null;
  /** The link, or the app's name, at the foot. */
  footer: string;
  quiet: boolean;
}

const W = 1080;
const PAD = 72;
const INNER = W - PAD * 2;
const COLORS = { paper: '#fffdf8', quietPaper: '#f6f4ef', fg: '#16201f', muted: '#5a5f58', primary: '#0b5d57', zari: '#c8911f', zariSoft: '#f7ebd2', kumkum: '#8c2356', line: '#e7e1d4' };
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

/** The gold zig-zag border of the on-screen card. */
function zari(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  ctx.fillStyle = COLORS.zari;
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
    text({ font: `600 30px ${BODY}`, color: card.quiet ? COLORS.muted : COLORS.kumkum, text: card.top, lineHeight: 44, gapBefore: 16 });
    text({ font: `600 40px ${DISPLAY}`, color: card.quiet ? COLORS.fg : COLORS.primary, text: card.kind, lineHeight: 56, gapBefore: 24 });
    if (card.forNames) text({ font: `700 76px ${DISPLAY}`, color: COLORS.fg, text: card.forNames, lineHeight: 96, gapBefore: 12 });
    text({ font: `400 30px ${BODY}`, color: COLORS.muted, text: card.invites, lineHeight: 44, gapBefore: 20, width: INNER - 160 });
    if (!card.quiet) {
      y += 36;
      if (draw) zari(ctx, W / 2 - 220, y, 440);
      y += 14;
    }
    y += 28;
    for (const f of card.functions) {
      const top = y;
      ctx.font = `600 30px ${BODY}`;
      const whenLines = wrap(ctx, f.when, INNER - 112).length;
      const venueLines = wrap(ctx, f.venue, INNER - 112).length;
      const h = 40 + 52 + (whenLines + venueLines) * 42 + 28;
      if (draw) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = COLORS.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(PAD + 24, top, INNER - 48, h, 20);
        ctx.fill();
        ctx.stroke();
      }
      y = top + 20;
      text({ font: `600 40px ${DISPLAY}`, color: COLORS.fg, text: f.name, lineHeight: 56, gapBefore: 12, align: 'left', width: INNER - 112 });
      text({ font: `400 30px ${BODY}`, color: COLORS.fg, text: `🗓  ${f.when}`, lineHeight: 42, gapBefore: 6, align: 'left', width: INNER - 112 });
      text({ font: `400 30px ${BODY}`, color: COLORS.fg, text: `📍  ${f.venue}`, lineHeight: 42, gapBefore: 0, align: 'left', width: INNER - 112 });
      y = top + h + 20;
    }
    if (card.message) text({ font: `400 32px ${BODY}`, color: COLORS.fg, text: card.message, lineHeight: 48, gapBefore: 16, width: INNER - 120 });
    text({ font: `400 24px ${BODY}`, color: COLORS.muted, text: card.footer, lineHeight: 36, gapBefore: 40 });
    return y + PAD + 24;
  };

  canvas.width = W;
  canvas.height = 4000;
  const height = layout(false);
  canvas.height = height;
  ctx.fillStyle = card.quiet ? COLORS.quietPaper : COLORS.paper;
  ctx.fillRect(0, 0, W, height);
  // A double gold frame for a celebration, one quiet line for a remembrance.
  ctx.lineWidth = 4;
  ctx.strokeStyle = card.quiet ? '#b8b4aa' : COLORS.zari;
  ctx.strokeRect(PAD / 2, PAD / 2, W - PAD, height - PAD);
  if (!card.quiet) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.zariSoft;
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
