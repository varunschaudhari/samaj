import type { Branch } from '@samaj/shared';
import { Select, Skeleton } from '@/components/ui';
import { useLanguageStore, useT } from '@/i18n';
import { branchName, groupBranches, useBranches } from './api';

interface BranchSelectProps {
  label: string;
  value: string;
  onChange: (branchId: string) => void;
  /** The first option, meaning no branch filter: "All branches". */
  allLabel: string;
  /** Only these branches (and their towns), e.g. a committee member's own district. */
  within?: string;
  hideLabel?: boolean;
  fieldClassName?: string;
}

/** Districts with their towns, as a filter. Choosing a district includes every town in it. */
export function BranchSelect({ label, value, onChange, allLabel, within, hideLabel = true, fieldClassName = 'md:w-48' }: BranchSelectProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const branches = useBranches();
  if (branches.isPending) return <Skeleton className={`h-touch w-full rounded-sm ${fieldClassName}`} />;

  const all = branches.data ?? [];
  const inScope = (b: Branch) => !within || b.id === within || b.parentId === within;
  const groups = groupBranches(all, language)
    .map(({ district, children }) => ({ district, children: children.filter(inScope), showDistrict: inScope(district) }))
    .filter((g) => g.showDistrict || g.children.length > 0);

  return (
    <Select
      label={label}
      hideLabel={hideLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={branches.isError}
      fieldClassName={fieldClassName}
    >
      <option value="">{allLabel}</option>
      {groups.map(({ district, children, showDistrict }) => (
        <optgroup key={district.id} label={branchName(district, language)}>
          {showDistrict && (
            <option value={district.id}>
              {branchName(district, language)} ({t('branchKind.district')})
            </option>
          )}
          {children.map((b) => (
            <option key={b.id} value={b.id}>
              {branchName(b, language)}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** "Branch: Amalner", for an applied-filter chip. */
export function useBranchLabel(branchId: string): string | null {
  const language = useLanguageStore((s) => s.language);
  const branches = useBranches();
  const branch = branches.data?.find((b) => b.id === branchId);
  return branch ? branchName(branch, language) : null;
}
