import { useEffect, useState } from 'react';
import { create } from 'zustand';

// Must match the cache names in vite.config.ts.
const DATA_CACHES = ['samaj-api', 'samaj-photos'];

/**
 * Forget everything saved for offline use. Called on sign-in and sign-out so
 * a shared phone never shows the previous person's data without a connection.
 */
export async function clearOfflineData(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await Promise.all(DATA_CACHES.map((name) => caches.delete(name).catch(() => false)));
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Chrome's install prompt, captured when it fires so a button can show it later. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  prompt: InstallPromptEvent | null;
  installed: boolean;
}

export const useInstallStore = create<InstallState>(() => ({
  prompt: null,
  installed: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
}));

/** Call once at startup: the browser fires the event early, before any screen mounts. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    useInstallStore.setState({ prompt: event as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => useInstallStore.setState({ prompt: null, installed: true }));
}

export async function promptInstall(): Promise<boolean> {
  const { prompt } = useInstallStore.getState();
  if (!prompt) return false;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  useInstallStore.setState({ prompt: null });
  return outcome === 'accepted';
}
