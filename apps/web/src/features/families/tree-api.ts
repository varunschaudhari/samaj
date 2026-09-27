import type { FamilyTree } from '@samaj/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** The tree around one family. Under ['family', id], so anything that changes a family refreshes it. */
export function useFamilyTree(familyId: string, enabled = true) {
  return useQuery({
    queryKey: ['family', familyId, 'tree'],
    queryFn: async ({ signal }) => (await api.get<{ tree: FamilyTree }>(`/families/${familyId}/tree`, undefined, signal)).tree,
    enabled: Boolean(familyId) && enabled,
  });
}
