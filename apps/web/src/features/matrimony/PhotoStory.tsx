import { type ReactNode, useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

interface PhotoStoryProps {
  photos: { id: string; url: string }[];
  name: string;
  /** Laid over the bottom of the photo, on a shade: name, age, place. */
  children?: ReactNode;
  className?: string;
}

/** Initials for the no-photo portrait: first letters of the first two words. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('');

/**
 * Photos as a story, the way dating apps show them: thin bars along the top,
 * tap the right side for the next photo and the left for the previous one.
 * Arrow keys work too. With no photo, a peacock portrait with initials.
 */
export function PhotoStory({ photos, name, children, className }: PhotoStoryProps) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const count = photos.length;
  const current = photos[Math.min(index, Math.max(count - 1, 0))];
  // A different person, or photos removed: back to the first.
  useEffect(() => setIndex(0), [photos.map((p) => p.id).join()]);

  const go = (step: number) => setIndex((i) => Math.min(Math.max(i + step, 0), count - 1));

  return (
    <div
      className={cn('relative isolate overflow-hidden bg-hero', className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
      }}
    >
      {current ? (
        <img key={current.id} src={current.url} alt={t('matrimony.photoOf', { name })} className="absolute inset-0 -z-10 size-full object-cover object-top" />
      ) : (
        <div className="absolute inset-0 -z-10 flex items-center justify-center" aria-hidden="true">
          <span className="font-display text-[5.5rem] leading-none font-semibold text-on-hero-muted/70">{initialsOf(name)}</span>
        </div>
      )}

      {count > 1 && (
        <>
          <div className="absolute inset-x-3 top-3 z-10 flex gap-1" aria-hidden="true">
            {photos.map((p, i) => (
              <span key={p.id} className={cn('h-1 flex-1 rounded-full transition-colors duration-200', i <= index ? 'bg-on-photo' : 'bg-on-photo/40')} />
            ))}
          </div>
          {/* Tap zones: the left third goes back, the rest goes forward. */}
          <button type="button" className="absolute inset-y-0 left-0 z-10 w-1/3 focus-visible:outline-none" aria-label={t('matrimony.photos.previous')} disabled={index === 0} onClick={() => go(-1)} />
          <button
            type="button"
            className="absolute inset-y-0 right-0 z-10 w-2/3 focus-visible:outline-none"
            aria-label={t('matrimony.photos.next', { n: Math.min(index + 2, count), total: count })}
            disabled={index === count - 1}
            onClick={() => go(1)}
          />
        </>
      )}

      {children && <div className="photo-shade pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 pt-24 text-on-photo">{children}</div>}
    </div>
  );
}
