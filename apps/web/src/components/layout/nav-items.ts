import { type Permission, type Role, can } from '@samaj/shared';
import { BookUser, ClipboardCheck, HeartHandshake, House, type LucideIcon, Megaphone, Palette, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import type { MessageKey } from '@/i18n';

export interface NavItem {
  to: string;
  label: MessageKey;
  /** A shorter label for the phone tab bar, where five share 360px. */
  tabLabel?: MessageKey;
  icon: LucideIcon;
  /** Shown only to roles with this permission. */
  permission?: Permission;
  /** Shows the count of families waiting for review. */
  pendingBadge?: boolean;
  /** Development tools: in the sidebar only, never in the phone tab bar or production. */
  devOnly?: boolean;
  /** Left out of the phone tab bar. */
  sidebarOnly?: boolean;
  /** Hidden for these roles, e.g. admins reach Review from inside Admin. */
  hideForRoles?: Role[];
  /** Left out of the phone tab bar for these roles, to keep it at five; they reach it from Home. */
  tabBarHideForRoles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/home', label: 'nav.home', icon: House },
  { to: '/directory', label: 'nav.directory', icon: BookUser },
  { to: '/community', label: 'nav.community', tabLabel: 'nav.community.short', icon: Megaphone },
  { to: '/family', label: 'nav.family', tabLabel: 'nav.family.short', icon: UsersRound },
  // Committee and admins get Review or Admin as their fifth tab; Matrimony is a Home tile for them.
  { to: '/matrimony', label: 'nav.matrimony', icon: HeartHandshake, tabBarHideForRoles: ['committee', 'admin', 'superadmin'] },
  { to: '/review', label: 'nav.review', icon: ClipboardCheck, permission: 'member:verify', pendingBadge: true, hideForRoles: ['admin', 'superadmin'] },
  { to: '/admin', label: 'nav.admin', icon: ShieldCheck, permission: 'user:assign-role', pendingBadge: true },
  // On phones Profile is the avatar in the top bar.
  { to: '/profile', label: 'nav.profile', icon: UserRound, sidebarOnly: true },
  { to: '/styleguide', label: 'nav.styleguide', icon: Palette, devOnly: true },
];

export const visibleNavItems = (role: Role | undefined) =>
  NAV_ITEMS.filter((item) => (!item.devOnly || import.meta.env.DEV) && (!item.permission || (role && can(role, item.permission))) && !(role && item.hideForRoles?.includes(role)));

export const tabBarItems = (role: Role | undefined) =>
  visibleNavItems(role).filter((item) => !item.devOnly && !item.sidebarOnly && !(role && item.tabBarHideForRoles?.includes(role)));
