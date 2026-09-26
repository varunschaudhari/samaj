import type { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * The only way to render an icon. Three sizes, one stroke width, colour from
 * currentColor.
 *   sm 16px  inline with text
 *   md 20px  inside buttons and inputs
 *   lg 24px  navigation
 * Sizes are in rem so icons scale with the browser's text size.
 */
const SIZE_CLASS = { sm: 'size-4', md: 'size-5', lg: 'size-6' } as const;
export type IconSize = keyof typeof SIZE_CLASS;

export const ICON_STROKE_WIDTH = 1.75;

interface IconProps extends Omit<LucideProps, 'size' | 'strokeWidth' | 'color' | 'ref'> {
  icon: LucideIcon;
  size?: IconSize;
  /** Only when the icon carries meaning on its own. Otherwise it's hidden from screen readers. */
  label?: string;
}

export function Icon({ icon: Glyph, size = 'md', label, className, ...rest }: IconProps) {
  return (
    <Glyph
      strokeWidth={ICON_STROKE_WIDTH}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      className={cn(SIZE_CLASS[size], 'shrink-0', className)}
      {...rest}
    />
  );
}
