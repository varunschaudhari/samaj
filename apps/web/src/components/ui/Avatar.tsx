import { type VariantProps, cva } from 'class-variance-authority';
import { useState } from 'react';
import { cn } from '@/lib/cn';

const avatarVariants = cva('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none', {
  variants: {
    size: {
      sm: 'size-8 text-xs',
      md: 'size-10 text-sm',
      lg: 'size-12 text-base',
      xl: 'size-16 text-xl',
    },
  },
  defaultVariants: { size: 'md' },
});

const TINTS = ['bg-primary-soft text-primary', 'bg-zari-soft text-zari-fg', 'bg-kumkum-soft text-kumkum', 'bg-info-soft text-info'];

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** First character of each of the first two words. Grapheme-aware, so "सुनीता" gives "सु", not "स". */
export function initials(name: string): string {
  const firstGrapheme = (word: string) => (segmenter ? ([...segmenter.segment(word)][0]?.segment ?? '') : word.charAt(0));
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return picked.map((w) => firstGrapheme(w ?? '').toLocaleUpperCase()).join('');
}

function tintFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return TINTS[hash % TINTS.length] ?? TINTS[0]!;
}

interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string;
  src?: string | null | undefined;
  className?: string;
}

/** A photo when there is one, otherwise initials on a tint chosen from the name. */
export function Avatar({ name, src, size, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <span className={cn(avatarVariants({ size }), !showImage && tintFor(name), className)} aria-hidden="true">
      {showImage ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
