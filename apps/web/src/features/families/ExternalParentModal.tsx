import type { FamilyLinkView, FamilyMember } from '@samaj/shared';
import { useEffect, useState } from 'react';
import { Button, Chip, Modal, Skeleton, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { useErrorMessage, useT } from '@/i18n';
import { useFamily, useSetExternalParent } from './api';

/**
 * Someone's parent lives in another family: a head whose father still heads
 * the family home, a wife whose father is in her माहेर. Picked from the
 * families already linked to this one, then from that family's people.
 */
export function ExternalParentModal({ familyId, member, links, onClose }: { familyId: string; member: FamilyMember | null; links: FamilyLinkView[]; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [otherId, setOtherId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const other = useFamily(otherId ?? undefined);
  const save = useSetExternalParent(familyId);

  useEffect(() => {
    setOtherId(member?.externalParent?.family.id ?? null);
    setParentId(member?.externalParent?.id ?? null);
    save.reset();
    // Only when the modal opens for someone.
  }, [member?.id]);

  if (!member) return <Modal open={false} onClose={onClose} title="" />;
  const linked = links.filter((l) => l.family.canView);
  const done = (message: string) => () => {
    toast.success(message);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('parentElsewhere.title', { name: member.name })}
      description={t('parentElsewhere.body')}
      footer={
        <>
          {member.externalParent && (
            <Button variant="ghost" loading={save.isPending && parentId === null} onClick={() => save.mutate({ memberId: member.id, parentId: null }, { onSuccess: done(t('parentElsewhere.removed')) })}>
              {t('parentElsewhere.remove')}
            </Button>
          )}
          <Button
            disabled={!parentId}
            loading={save.isPending && parentId !== null}
            onClick={() => parentId && save.mutate({ memberId: member.id, parentId }, { onSuccess: done(t('parentElsewhere.saved')) })}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {save.isError && <FormAlert message={errorMessage(save.error)} />}
        {linked.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('parentElsewhere.noLinks')}</p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-fg">{t('parentElsewhere.family')}</legend>
            <div className="flex flex-wrap gap-2">
              {linked.map((l) => (
                <Chip
                  key={l.family.id}
                  selected={otherId === l.family.id}
                  onClick={() => {
                    setOtherId(l.family.id);
                    setParentId(null);
                  }}
                  className="px-3"
                >
                  {t('family.title', { name: l.family.headName })}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}
        {otherId && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-fg">{t('parentElsewhere.person')}</legend>
            {other.isPending ? (
              <Skeleton className="h-11 w-full" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {(other.data?.members ?? []).map((m) => (
                  <Chip key={m.id} selected={parentId === m.id} onClick={() => setParentId(m.id)} className="px-3">
                    {m.name} · {t(`relation.${m.relation}`)}
                  </Chip>
                ))}
              </div>
            )}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
