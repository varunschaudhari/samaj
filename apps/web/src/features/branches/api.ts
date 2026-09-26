import type { Branch, Language } from '@samaj/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => (await api.get<{ items: Branch[] }>('/branches')).items,
    staleTime: 10 * 60_000,
  });
}

export function branchName(branch: Pick<Branch, 'name' | 'nameMr'>, language: Language): string {
  return language === 'mr' && branch.nameMr ? branch.nameMr : branch.name;
}

export interface BranchGroup {
  district: Branch;
  children: Branch[];
}

/** Districts with their cities and towns, for <optgroup> lists. */
export function groupBranches(branches: Branch[], language: Language): BranchGroup[] {
  const byName = (a: Branch, b: Branch) => branchName(a, language).localeCompare(branchName(b, language), language);
  return branches
    .filter((b) => b.parentId === null)
    .sort(byName)
    .map((district) => ({
      district,
      children: branches.filter((b) => b.parentId === district.id).sort(byName),
    }));
}
