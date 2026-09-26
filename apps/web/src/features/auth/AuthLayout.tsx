import type { ReactNode } from 'react';
import { BrandMark } from '@/components/layout/BrandMark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <BrandMark />
        <LanguageSwitch />
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pt-6 pb-12 sm:justify-center sm:pt-0">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold text-fg">{title}</h1>
            <p className="text-fg-muted">{subtitle}</p>
          </div>
          {children}
          <p className="text-center text-sm text-fg-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}
