import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge about our custom text sizes so `text-fg` (colour) and
// `text-lg` (size) are recognised as different groups and don't cancel out.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'],
      radius: ['xs', 'sm', 'md', 'lg', 'full'],
      shadow: ['raised', 'overlay'],
    },
  },
});

/** Compose class names; later classes win over conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
