import { cn } from '@/lib/cn';
import type { AppIcon } from './icons';

/**
 * The only way to render an icon. Three sizes, colour from currentColor, and
 * a weight: regular for UI, fill for the current tab, duotone for feature
 * tiles and dashboard figures.
 *   sm 16px  inline with text
 *   md 20px  inside buttons and inputs
 *   lg 24px  navigation
 *   xl 32px  tiles and figures
 * Sizes are in rem so icons scale with the browser's text size.
 */
const SIZE_CLASS = { sm: 'size-4', md: 'size-5', lg: 'size-6', xl: 'size-8' } as const;
export type IconSize = keyof typeof SIZE_CLASS;

interface IconProps {
  icon: AppIcon;
  size?: IconSize;
  /** Only these three are in the build (vite.config.ts drops the rest). */
  weight?: 'regular' | 'fill' | 'duotone';
  /** Only when the icon carries meaning on its own. Otherwise it's hidden from screen readers. */
  label?: string;
  className?: string;
}

export function Icon({ icon: Glyph, size = 'md', weight = 'regular', label, className }: IconProps) {
  return (
    <Glyph
      weight={weight}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      className={cn(SIZE_CLASS[size], 'shrink-0', className)}
    />
  );
}
