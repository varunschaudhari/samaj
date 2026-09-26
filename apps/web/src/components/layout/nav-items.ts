import { type LucideIcon, Palette, UserRound, Users } from 'lucide-react';
import type { MessageKey } from '@/i18n';

export interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  devOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/directory', label: 'nav.directory', icon: Users },
  { to: '/profile', label: 'nav.profile', icon: UserRound },
  { to: '/styleguide', label: 'nav.styleguide', icon: Palette, devOnly: true },
];

export const visibleNavItems = () => NAV_ITEMS.filter((item) => !item.devOnly || import.meta.env.DEV);
