import { Skeleton } from '@/components/ui';

/** What the shell looks like while we find out who is signed in. Same geometry as AppShell. */
export function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-canvas md:grid md:grid-cols-[15rem_1fr]" aria-busy="true">
      <div className="hidden h-dvh flex-col gap-6 border-r border-line bg-surface px-6 py-5 md:flex">
        <Skeleton className="h-8 w-28 rounded-sm" />
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-touch w-full rounded-sm" />
        ))}
      </div>
      <div>
        <div className="flex h-15 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
          <Skeleton className="h-8 w-28 rounded-sm" />
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>
        <div className="flex flex-col gap-4 px-4 pt-5 sm:px-6 md:px-8 md:pt-8">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-touch w-full rounded-sm" />
          <Skeleton className="h-28 w-full rounded-md" />
          <Skeleton className="h-28 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
