import { MapPin } from '@/components/ui/icons';
import { Link } from 'react-router';
import { EmptyState, buttonVariants } from '@/components/ui';
import { useT } from '@/i18n';

export function NotFoundPage() {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <EmptyState
        icon={MapPin}
        title={t('notFound.title')}
        body={t('notFound.body')}
        className="w-full"
        action={
          <Link to="/directory" className={buttonVariants()}>
            {t('notFound.home')}
          </Link>
        }
      />
    </main>
  );
}
