import { MAX_PROFILE_PHOTOS, type ProfileDetail } from '@samaj/shared';
import { Camera, Star, Trash2 } from '@/components/ui/icons';
import { useRef, useState } from 'react';
import { Avatar, Button, Card, CardTitle, IconButton, toast } from '@/components/ui';
import { useErrorMessage, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useProfilePhotos } from './api';

/** The photos to show: the profile's own, else the person's photo from the family page. */
export function galleryOf(p: ProfileDetail): { id: string; url: string }[] {
  if (p.photos.length) return p.photos;
  return p.familyPhotoUrl ? [{ id: 'family', url: p.familyPhotoUrl }] : [];
}

/** A large main photo with thumbnails to switch between them. Initials when there is no photo. */
export function PhotoGallery({ profile, className }: { profile: ProfileDetail; className?: string }) {
  const t = useT();
  const photos = galleryOf(profile);
  const [index, setIndex] = useState(0);
  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className={cn('relative w-full overflow-hidden bg-primary-soft', current ? 'aspect-[4/5]' : 'h-40 md:h-full md:min-h-72')}>
        {current ? (
          <img src={current.url} alt={t('matrimony.photoOf', { name: profile.name })} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Avatar name={profile.name} size="xl" className="size-28 text-3xl" />
          </div>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 px-3 pb-3 md:px-0" role="group" aria-label={t('matrimony.photos.title')}>
          {photos.map((ph, i) => (
            <button
              key={ph.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t('matrimony.photos.show', { n: i + 1 })}
              aria-pressed={i === index}
              className={cn(
                'size-14 overflow-hidden rounded-sm border-2 transition-colors duration-150',
                i === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <img src={ph.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** For the family: add up to four photos, choose the main one, remove any. */
export function PhotoManager({ profile }: { profile: ProfileDetail }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const input = useRef<HTMLInputElement>(null);
  const { add, makeMain, remove } = useProfilePhotos(profile.id);
  const onError = (err: unknown) => toast.error(errorMessage(err));
  const full = profile.photos.length >= MAX_PROFILE_PHOTOS;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <CardTitle>{t('matrimony.photos.title')}</CardTitle>
        <p className="text-sm text-fg-muted">
          {t('matrimony.photos.hint', { max: MAX_PROFILE_PHOTOS })}
          {profile.photos.length === 0 && profile.familyPhotoUrl && ` ${t('matrimony.photos.fromFamily')}`}
        </p>
      </div>
      {profile.photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {profile.photos.map((ph, i) => (
            <li key={ph.id} className="relative aspect-square overflow-hidden rounded-sm bg-surface-muted">
              <img src={ph.url} alt="" className="size-full object-cover" />
              {i === 0 && (
                <span className="absolute top-1 left-1 rounded-xs bg-primary px-1.5 py-0.5 text-xs font-semibold text-on-primary">{t('matrimony.photos.main')}</span>
              )}
              <div className="absolute right-0 bottom-0 left-0 flex justify-end gap-0.5 bg-scrim/60 p-0.5">
                {i > 0 && (
                  <IconButton
                    icon={Star}
                    label={t('matrimony.photos.makeMain')}
                    className="text-on-primary hover:bg-transparent"
                    onClick={() => makeMain.mutate(ph.id, { onError })}
                  />
                )}
                <IconButton
                  icon={Trash2}
                  label={t('matrimony.photos.remove')}
                  className="text-on-primary hover:bg-transparent"
                  onClick={() => remove.mutate(ph.id, { onSuccess: () => toast.success(t('matrimony.photos.removed')), onError })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) add.mutate(file, { onSuccess: () => toast.success(t('matrimony.photos.added')), onError, onSettled: () => input.current && (input.current.value = '') });
        }}
      />
      {!full && (
        <Button variant="secondary" size="sm" leadingIcon={Camera} className="self-start" loading={add.isPending} onClick={() => input.current?.click()}>
          {t('matrimony.photos.add')}
        </Button>
      )}
    </Card>
  );
}
