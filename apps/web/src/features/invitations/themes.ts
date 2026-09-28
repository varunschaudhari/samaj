import { CELEBRATION_THEMES, type InvitationKind, type InvitationTheme, REMEMBRANCE_THEMES } from '@samaj/shared';
import type { CSSProperties } from 'react';
import { isRemembrance } from './kinds';

/*
 * The card themes, one palette each, shared by the card on screen, the card
 * image and the preview swatches so all three always match. Printed-card
 * colours: the same whatever the phone's light or dark mode.
 */

export type Ornament = 'zari' | 'marigold' | 'line' | 'lotus' | 'none';

export interface ThemePalette {
  /** The card's background, and its text. */
  paper: string;
  ink: string;
  muted: string;
  /** The occasion's name. */
  accent: string;
  /** "॥ श्री गणेशाय नमः ॥" or "In loving memory". */
  top: string;
  /** The border, and an inner second border (null: a single line). */
  frame: string;
  frameInner: string | null;
  /** Each function's box. */
  panel: string;
  panelLine: string;
  /** The muhurat line. */
  highlight: string;
  ornament: Ornament;
  ornamentColor: string;
}

export const THEMES: Record<InvitationTheme, ThemePalette> = {
  // Zari gold and kumkum on cream: the patrika most families print.
  traditional: {
    paper: '#fffdf8', ink: '#16201f', muted: '#5a5f58', accent: '#0b5d57', top: '#8c2356',
    frame: '#c8911f', frameInner: '#f7ebd2', panel: '#ffffff', panelLine: '#e7e1d4', highlight: '#8c2356',
    ornament: 'zari', ornamentColor: '#c8911f',
  },
  // Deep maroon with gold lettering, for a wedding reception.
  royal: {
    paper: '#5a1428', ink: '#fbf1dc', muted: '#e9cfa6', accent: '#f0c35a', top: '#f0c35a',
    frame: '#d4a437', frameInner: '#7a2a3e', panel: '#6b1d33', panelLine: '#8a3a50', highlight: '#f0c35a',
    ornament: 'zari', ornamentColor: '#d4a437',
  },
  // Marigold garlands on warm cream: मुंज, बारसे, डोहाळे.
  floral: {
    paper: '#fff8ec', ink: '#3a2010', muted: '#7a5a44', accent: '#c2410c', top: '#b91c1c',
    frame: '#f59e0b', frameInner: '#fde68a', panel: '#fffdf7', panelLine: '#f5d9a8', highlight: '#b91c1c',
    ornament: 'marigold', ornamentColor: '#f59e0b',
  },
  // White and plain, for those who want it simple.
  minimal: {
    paper: '#ffffff', ink: '#111827', muted: '#6b7280', accent: '#111827', top: '#6b7280',
    frame: '#d1d5db', frameInner: null, panel: '#f9fafb', panelLine: '#e5e7eb', highlight: '#0b5d57',
    ornament: 'line', ornamentColor: '#9ca3af',
  },
  // Remembrance: soft grey, no ornament.
  quiet: {
    paper: '#f6f4ef', ink: '#16201f', muted: '#5a5f58', accent: '#16201f', top: '#5a5f58',
    frame: '#b8b4aa', frameInner: null, panel: '#ffffff', panelLine: '#e7e1d4', highlight: '#5a5f58',
    ornament: 'none', ornamentColor: '#b8b4aa',
  },
  // Remembrance: white with a lotus.
  lotus: {
    paper: '#fbfbfa', ink: '#1f2937', muted: '#6b7280', accent: '#475569', top: '#64748b',
    frame: '#cbd5e1', frameInner: '#eef2f7', panel: '#ffffff', panelLine: '#e2e8f0', highlight: '#475569',
    ornament: 'lotus', ornamentColor: '#94a3b8',
  },
};

/** The themes to choose from for an occasion. */
export const themesFor = (kind: InvitationKind): readonly InvitationTheme[] => (isRemembrance(kind) ? REMEMBRANCE_THEMES : CELEBRATION_THEMES);

/** The palette as CSS variables, for the card's classes to use. */
export function themeVars(theme: InvitationTheme): CSSProperties {
  const p = THEMES[theme];
  return {
    '--c-paper': p.paper,
    '--c-ink': p.ink,
    '--c-muted': p.muted,
    '--c-accent': p.accent,
    '--c-top': p.top,
    '--c-frame': p.frame,
    '--c-frame-inner': p.frameInner ?? 'transparent',
    '--c-panel': p.panel,
    '--c-panel-line': p.panelLine,
    '--c-highlight': p.highlight,
    '--c-ornament': p.ornamentColor,
  } as CSSProperties;
}
