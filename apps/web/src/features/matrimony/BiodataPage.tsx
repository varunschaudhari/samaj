import { formatPhone } from '@samaj/shared';
import { ArrowLeft, HeartHandshake, Printer, Share } from '@/components/ui/icons';
import { Link, useParams } from 'react-router';
import { BrandMark } from '@/components/layout/BrandMark';
import { Avatar, Button, EmptyState, ErrorState, Icon, Skeleton, buttonVariants, toast } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useProfile } from './api';
import { biodataSections, headlineFacts, preferenceChips } from './biodata';
import { galleryOf } from './ProfilePhotos';

/**
 * The profile as a one-page biodata, laid out like the printed ones families
 * exchange. Print (or save as PDF) from the browser; the toolbar is hidden
 * on paper. Contact details appear only where the profile page shows them:
 * for the family itself, and after an accepted interest.
 */
export function BiodataPage() {
  const { id = '' } = useParams();
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const profile = useProfile(id);

  if (profile.isPending) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[40rem] w-full rounded-md" />
      </div>
    );
  }
  if (profile.isError) {
    return (
      <div className="mx-auto max-w-md p-4 pt-12">
        {profile.error instanceof ApiError && profile.error.status === 404 ? (
          <EmptyState icon={HeartHandshake} title={t('matrimony.gone.title')} body={t('matrimony.gone.body')} />
        ) : (
          <ErrorState title={t('matrimony.error.title')} error={profile.error} onRetry={() => profile.refetch()} retrying={profile.isFetching} />
        )}
      </div>
    );
  }

  const p = profile.data;
  const photo = galleryOf(p)[0];
  const sections = biodataSections(p, t, language);
  const prefs = preferenceChips(p, t, language);
  const facts = headlineFacts(p, t, language);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: t('matrimony.biodata.title', { name: p.name }), url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t('matrimony.biodata.copied'));
      }
    } catch {
      // Cancelled, or the clipboard is unavailable: nothing to do.
    }
  };

  return (
    <div className="min-h-dvh bg-canvas pb-10 print:bg-white print:pb-0">
      {/* Toolbar: on screen only. */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Link to={`/matrimony/profiles/${p.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            <Icon icon={ArrowLeft} />
            {t('matrimony.biodata.back')}
          </Link>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" leadingIcon={Share} onClick={share}>
              {t('matrimony.biodata.share')}
            </Button>
            <Button size="sm" leadingIcon={Printer} onClick={() => window.print()}>
              {t('matrimony.biodata.print')}
            </Button>
          </div>
        </div>
      </div>

      <article className="mx-auto mt-4 max-w-3xl border border-line bg-surface px-5 py-6 shadow-card sm:mt-6 sm:rounded-md sm:px-10 sm:py-8 print:mt-0 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        {/* Title band, like the printed ones: a ruled heading with a zari line. */}
        <header className="flex flex-col items-center gap-2 border-b-2 border-zari pb-4 text-center">
          <BrandMark className="scale-90" />
          <h1 className="font-display text-2xl font-semibold tracking-wide text-primary">{t('matrimony.biodata.heading')}</h1>
        </header>

        <section className="flex flex-col-reverse gap-5 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="font-display text-3xl font-semibold break-words text-fg">{p.name}</h2>
            {facts.length > 0 && <p className="text-lg font-medium text-fg tabular-nums">{facts.join(' · ')}</p>}
            <p className="text-fg-muted">{placeLabel(p.place, p.branch, language)}</p>
            {[p.education, p.occupation].some(Boolean) && <p className="text-fg">{[p.education, p.occupation].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="w-40 shrink-0 self-center overflow-hidden rounded-md border border-line bg-primary-soft sm:self-start">
            {photo ? (
              <img src={photo.url} alt={t('matrimony.photoOf', { name: p.name })} className="aspect-[4/5] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center">
                <Avatar name={p.name} size="xl" />
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <section key={section.id} className="break-inside-avoid">
              <h3 className="mb-2 border-b border-line pb-1 text-sm font-semibold tracking-wide text-primary uppercase">{section.title}</h3>
              <dl className="grid gap-x-6 sm:grid-cols-2">
                {section.rows.map((r) => (
                  <div key={r.label} className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm">
                    <dt className="text-fg-muted">{r.label}</dt>
                    <dd className="font-medium break-words text-fg">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          {p.about && (
            <section className="break-inside-avoid">
              <h3 className="mb-2 border-b border-line pb-1 text-sm font-semibold tracking-wide text-primary uppercase">{t('matrimony.about')}</h3>
              <p className="text-sm whitespace-pre-line text-fg">{p.about}</p>
            </section>
          )}
          {(p.expectations || prefs.length > 0) && (
            <section className="break-inside-avoid">
              <h3 className="mb-2 border-b border-line pb-1 text-sm font-semibold tracking-wide text-primary uppercase">{t('matrimony.expectations')}</h3>
              {prefs.length > 0 && <p className="text-sm font-medium text-fg">{prefs.join(' · ')}</p>}
              {p.expectations && <p className="mt-1 text-sm whitespace-pre-line text-fg">{p.expectations}</p>}
            </section>
          )}

          <section className="break-inside-avoid rounded-md bg-surface-muted p-4 print:border print:border-line print:bg-white">
            <h3 className="mb-1 text-sm font-semibold tracking-wide text-primary uppercase">{t('matrimony.contact')}</h3>
            {p.contact ? (
              <p className="text-fg">
                <span className="font-semibold">{p.contact.name}</span> · <span className="tabular-nums">{formatPhone(p.contact.phone)}</span>
              </p>
            ) : (
              <p className="text-sm text-fg-muted">{t('matrimony.biodata.contactHidden')}</p>
            )}
          </section>
        </div>

        <footer className="mt-8 border-t border-line pt-3 text-center text-xs text-fg-muted">{t('matrimony.biodata.footer')}</footer>
      </article>
    </div>
  );
}
