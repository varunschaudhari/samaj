import { type Permission, type Role, can } from '@samaj/shared';
import { ClipboardCheck, HeartHandshake, House, type LucideIcon, Palette, ShieldCheck, UserRound, Users } from 'lucide-react';
import type { MessageKey } from '@/i18n';

export interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  /** Shown only to roles with this permission. */
  permission?: Permission;
  /** Shows the count of families waiting for review. */
  pendingBadge?: boolean;
  /** Development tools: in the sidebar only, never in the phone tab bar or production. */
  devOnly?: boolean;
  /** Left out of the phone tab bar. */
  sidebarOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/directory', label: 'nav.directory', icon: Users },
  { to: '/family', label: 'nav.family', icon: House },
  { to: '/matrimony', label: 'nav.matrimony', icon: HeartHandshake },
  { to: '/review', label: 'nav.review', icon: ClipboardCheck, permission: 'member:verify', pendingBadge: true },
  { to: '/admin', label: 'nav.admin', icon: ShieldCheck, permission: 'user:assign-role' },
  // On phones Profile is the avatar in the top bar, which keeps the tab bar at five.
  { to: '/profile', label: 'nav.profile', icon: UserRound, sidebarOnly: true },
  { to: '/styleguide', label: 'nav.styleguide', icon: Palette, devOnly: true },
];

export const visibleNavItems = (role: Role | undefined) =>
  NAV_ITEMS.filter((item) => (!item.devOnly || import.meta.env.DEV) && (!item.permission || (role && can(role, item.permission))));
