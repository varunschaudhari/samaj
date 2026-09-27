/*
 * Every icon the app uses, from Phosphor (phosphoricons.com), in one place.
 * Screens import from here, never from the package, so the set stays small
 * and consistent, and swapping a glyph is a one-line change.
 *
 * Each import names one file, which keeps the dev server fast and the bundle
 * to the icons listed here.
 *
 * Weights: regular for UI, fill for the active tab, duotone for feature
 * tiles and dashboard figures. Pass `weight` through <Icon>.
 */
export type { Icon as AppIcon } from '@phosphor-icons/react/dist/lib/types';

// People and families
export { AddressBook as BookUser } from '@phosphor-icons/react/dist/csr/AddressBook';
export { User as UserRound } from '@phosphor-icons/react/dist/csr/User';
export { Users } from '@phosphor-icons/react/dist/csr/Users';
export { UsersThree as UsersRound } from '@phosphor-icons/react/dist/csr/UsersThree';
export { UsersFour } from '@phosphor-icons/react/dist/csr/UsersFour';
export { UserPlus } from '@phosphor-icons/react/dist/csr/UserPlus';
export { UserMinus } from '@phosphor-icons/react/dist/csr/UserMinus';
export { House } from '@phosphor-icons/react/dist/csr/House';
export { HandHeart as HeartHandshake } from '@phosphor-icons/react/dist/csr/HandHeart';
export { GraduationCap } from '@phosphor-icons/react/dist/csr/GraduationCap';
export { Briefcase } from '@phosphor-icons/react/dist/csr/Briefcase';

// Places and structure
export { MapPin } from '@phosphor-icons/react/dist/csr/MapPin';
export { Globe } from '@phosphor-icons/react/dist/csr/Globe';
export { TreeStructure as Network } from '@phosphor-icons/react/dist/csr/TreeStructure';
export { Buildings } from '@phosphor-icons/react/dist/csr/Buildings';

// Contact
export { Phone } from '@phosphor-icons/react/dist/csr/Phone';
export { PhoneCall } from '@phosphor-icons/react/dist/csr/PhoneCall';
export { DeviceMobile as Smartphone } from '@phosphor-icons/react/dist/csr/DeviceMobile';
export { PaperPlaneTilt as Send } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt';

// Community
export { Megaphone } from '@phosphor-icons/react/dist/csr/Megaphone';
export { CalendarDots as CalendarDays } from '@phosphor-icons/react/dist/csr/CalendarDots';
export { CalendarCheck as CalendarClock } from '@phosphor-icons/react/dist/csr/CalendarCheck';
export { CalendarPlus } from '@phosphor-icons/react/dist/csr/CalendarPlus';
export { Confetti as PartyPopper } from '@phosphor-icons/react/dist/csr/Confetti';
export { FlowerLotus as Flower2 } from '@phosphor-icons/react/dist/csr/FlowerLotus';
export { PushPin as Pin } from '@phosphor-icons/react/dist/csr/PushPin';
export { NotePencil } from '@phosphor-icons/react/dist/csr/NotePencil';
export { ChatCenteredDots as MessageSquareWarning } from '@phosphor-icons/react/dist/csr/ChatCenteredDots';

// Review, status and roles
export { ListChecks as ClipboardCheck } from '@phosphor-icons/react/dist/csr/ListChecks';
export { SealCheck as BadgeCheck } from '@phosphor-icons/react/dist/csr/SealCheck';
export { CheckCircle as CircleCheck } from '@phosphor-icons/react/dist/csr/CheckCircle';
export { Check } from '@phosphor-icons/react/dist/csr/Check';
export { Clock } from '@phosphor-icons/react/dist/csr/Clock';
export { HourglassMedium } from '@phosphor-icons/react/dist/csr/HourglassMedium';
export { Warning as TriangleAlert } from '@phosphor-icons/react/dist/csr/Warning';
export { WarningCircle as CircleAlert } from '@phosphor-icons/react/dist/csr/WarningCircle';
export { Info } from '@phosphor-icons/react/dist/csr/Info';
export { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
export { Key as KeyRound } from '@phosphor-icons/react/dist/csr/Key';

// Dashboard
export { SquaresFour as Dashboard } from '@phosphor-icons/react/dist/csr/SquaresFour';
export { ChartBar } from '@phosphor-icons/react/dist/csr/ChartBar';
export { ChartLineUp } from '@phosphor-icons/react/dist/csr/ChartLineUp';

// Search, filters and lists
export { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
export { MagnifyingGlassMinus as SearchX } from '@phosphor-icons/react/dist/csr/MagnifyingGlassMinus';
export { SlidersHorizontal } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
export { MagnifyingGlassPlus as ZoomIn } from '@phosphor-icons/react/dist/csr/MagnifyingGlassPlus';
export { MagnifyingGlassMinus as ZoomOut } from '@phosphor-icons/react/dist/csr/MagnifyingGlassMinus';
export { CornersIn } from '@phosphor-icons/react/dist/csr/CornersIn';
export { Rows } from '@phosphor-icons/react/dist/csr/Rows';
export { Funnel } from '@phosphor-icons/react/dist/csr/Funnel';
export { SortAscending } from '@phosphor-icons/react/dist/csr/SortAscending';
export { CaretUpDown } from '@phosphor-icons/react/dist/csr/CaretUpDown';
export { Tray as Inbox } from '@phosphor-icons/react/dist/csr/Tray';

// Actions
export { Plus } from '@phosphor-icons/react/dist/csr/Plus';
export { Minus } from '@phosphor-icons/react/dist/csr/Minus';
export { PencilSimple as Pencil } from '@phosphor-icons/react/dist/csr/PencilSimple';
export { Trash as Trash2 } from '@phosphor-icons/react/dist/csr/Trash';
export { X } from '@phosphor-icons/react/dist/csr/X';
export { XCircle } from '@phosphor-icons/react/dist/csr/XCircle';
export { Copy } from '@phosphor-icons/react/dist/csr/Copy';
export { Camera } from '@phosphor-icons/react/dist/csr/Camera';
export { DownloadSimple as Download } from '@phosphor-icons/react/dist/csr/DownloadSimple';
export { ArrowSquareOut as ExternalLink } from '@phosphor-icons/react/dist/csr/ArrowSquareOut';
export { ArrowClockwise as RotateCw } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
export { ArrowUUpLeft as Undo2 } from '@phosphor-icons/react/dist/csr/ArrowUUpLeft';
export { Play } from '@phosphor-icons/react/dist/csr/Play';
export { Pause } from '@phosphor-icons/react/dist/csr/Pause';
export { Eye } from '@phosphor-icons/react/dist/csr/Eye';
export { EyeSlash as EyeOff } from '@phosphor-icons/react/dist/csr/EyeSlash';
export { SignOut as LogOut } from '@phosphor-icons/react/dist/csr/SignOut';
export { Palette } from '@phosphor-icons/react/dist/csr/Palette';
export { Envelope as Mail } from '@phosphor-icons/react/dist/csr/Envelope';
export { Moon } from '@phosphor-icons/react/dist/csr/Moon';
export { Sun } from '@phosphor-icons/react/dist/csr/Sun';
export { GearSix as Settings } from '@phosphor-icons/react/dist/csr/GearSix';
export { WifiSlash as WifiOff } from '@phosphor-icons/react/dist/csr/WifiSlash';
export { CircleNotch as LoaderCircle } from '@phosphor-icons/react/dist/csr/CircleNotch';

// Navigation
export { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft';
export { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
export { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight';
export { CaretDown as ChevronDown } from '@phosphor-icons/react/dist/csr/CaretDown';
export { CaretUp as ChevronUp } from '@phosphor-icons/react/dist/csr/CaretUp';
