import type { Relation } from '@samaj/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { useFamily } from './api';
import { ExternalParentModal } from './ExternalParentModal';
import { MemberFormModal, type MemberPrefill } from './MemberFormModal';

/** What the tree asked for: someone new next to a person, whose child someone is, or their माहेर. */
export type TreeEdit =
  | { mode: 'add'; familyId: string; relation?: Relation; prefill?: MemberPrefill; context?: string }
  | { mode: 'edit'; familyId: string; memberId: string }
  | { mode: 'maher'; familyId: string; memberId: string };

/**
 * The family page's own forms, opened from the tree: the household is loaded
 * first, since the forms choose among its people. Whatever is saved, every
 * tree drawn from it is refreshed.
 */
export function AddFromTree({ edit, onClose }: { edit: TreeEdit | null; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const family = useFamily(edit?.familyId);
  const close = () => {
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'family' && q.queryKey[2] === 'tree' });
    onClose();
  };
  if (!edit) return null;
  if (!family.data) {
    return (
      <Modal open onClose={onClose} title={t('tree.add.loading')}>
        <Skeleton className="h-40 w-full rounded-md" />
      </Modal>
    );
  }
  const members = family.data.members;
  const head = members.find((m) => m.isHead);
  if (edit.mode === 'maher') {
    return <ExternalParentModal familyId={edit.familyId} member={members.find((m) => m.id === edit.memberId) ?? null} links={family.data.links} onClose={close} />;
  }
  return (
    <MemberFormModal
      familyId={edit.familyId}
      member={edit.mode === 'edit' ? (members.find((m) => m.id === edit.memberId) ?? null) : null}
      initialRelation={edit.mode === 'add' ? edit.relation : undefined}
      prefill={edit.mode === 'add' ? edit.prefill : undefined}
      context={edit.mode === 'add' ? edit.context : undefined}
      headGender={head?.gender}
      members={members}
      open
      onClose={close}
    />
  );
}
