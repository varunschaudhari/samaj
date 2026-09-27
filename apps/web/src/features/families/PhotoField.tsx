import { Camera, Trash2 } from '@/components/ui/icons';
import { useId, useRef } from 'react';
import { Avatar, Button, toast } from '@/components/ui';
import { useErrorMessage, useT } from '@/i18n';
import { useRemovePhoto, useUploadPhoto } from './api';

interface PhotoFieldProps {
  familyId: string;
  memberId: string;
  name: string;
  photoUrl: string | null;
}

/** Photo for an existing member. Uploads as soon as a file is picked; the modal's Save is for the text fields. */
export function PhotoField({ familyId, memberId, name, photoUrl }: PhotoFieldProps) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const upload = useUploadPhoto(familyId);
  const remove = useRemovePhoto(familyId);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(
      { memberId, file },
      {
        onSuccess: () => toast.success(t('member.photoSaved')),
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => {
          if (inputRef.current) inputRef.current.value = '';
        },
      },
    );
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-semibold text-fg">{t('member.photo')}</legend>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} src={photoUrl} size="xl" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <Button variant="secondary" size="sm" leadingIcon={Camera} loading={upload.isPending} onClick={() => inputRef.current?.click()}>
            {photoUrl ? t('member.changePhoto') : t('member.addPhoto')}
          </Button>
          {photoUrl && (
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={Trash2}
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(memberId, {
                  onSuccess: () => toast.success(t('member.photoRemoved')),
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              {t('member.removePhoto')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-fg-muted">{t('member.photoHint')}</p>
    </fieldset>
  );
}
