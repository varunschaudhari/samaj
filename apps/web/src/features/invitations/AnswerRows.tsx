import { type InvitationAnswer, type InvitationFunction, type InvitationKind, MAX_INVITATION_PEOPLE, type RsvpAnswer } from '@samaj/shared';
import { Chip, Input } from '@/components/ui';
import { formatEventTime } from '@/features/community/events-api';
import { type MessageKey, useLanguageStore, useT } from '@/i18n';
import { isRemembrance } from './kinds';

export const answerLabels = (kind: InvitationKind): Record<RsvpAnswer, MessageKey> =>
  isRemembrance(kind) ? { yes: 'invite.rsvp.attend', maybe: 'invite.rsvp.maybe', no: 'invite.rsvp.notAttend' } : { yes: 'invite.rsvp.yes', maybe: 'invite.rsvp.maybe', no: 'invite.rsvp.no' };

/** An answer being filled in: none chosen yet is ''. */
export type AnswerDraft = Omit<InvitationAnswer, 'answer'> & { answer: RsvpAnswer | '' };

/** One draft per function, starting from answers already given. */
export const startAnswers = (functions: InvitationFunction[], given: InvitationAnswer[] = []): AnswerDraft[] =>
  functions.map((f) => given.find((a) => a.functionId === f.id) ?? { functionId: f.id, answer: '', people: 2 });

export const answersReady = (answers: AnswerDraft[]) => answers.length > 0 && answers.every((a) => a.answer !== '');
export const answersToInput = (answers: AnswerDraft[]) => answers.map((a) => ({ functionId: a.functionId, answer: a.answer as RsvpAnswer, people: a.people }));

/** For each function: coming, maybe or not, and how many people. */
export function AnswerRows({ kind, functions, answers, onChange }: { kind: InvitationKind; functions: InvitationFunction[]; answers: AnswerDraft[]; onChange: (a: AnswerDraft[]) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const labels = answerLabels(kind);
  // Remembrance: attend or not, no "maybe".
  const choices: RsvpAnswer[] = isRemembrance(kind) ? ['yes', 'no'] : ['yes', 'maybe', 'no'];
  const set = (i: number, patch: Partial<AnswerDraft>) => onChange(answers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <>
      {functions.map((f, i) => {
        const a = answers[i];
        if (!a) return null;
        return (
          <div key={f.id} className="flex flex-col gap-2 border-b border-line pb-4 last:border-0 last:pb-0">
            <div className="flex flex-col">
              <span className="font-semibold text-fg">{f.name}</span>
              <span className="text-sm text-fg-muted">{formatEventTime(f.startsAt, f.endsAt, language)}</span>
            </div>
            <div className="flex flex-wrap items-end gap-2" role="group" aria-label={f.name}>
              {choices.map((c) => (
                <Chip key={c} selected={a.answer === c} onClick={() => set(i, { answer: c })} className="px-4">
                  {t(labels[c])}
                </Chip>
              ))}
              {a.answer && a.answer !== 'no' && (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_INVITATION_PEOPLE}
                  label={t('invite.rsvp.people')}
                  value={String(a.people)}
                  onChange={(e) => set(i, { people: Math.max(0, Math.min(MAX_INVITATION_PEOPLE, Number(e.target.value) || 0)) })}
                  fieldClassName="w-32"
                />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
