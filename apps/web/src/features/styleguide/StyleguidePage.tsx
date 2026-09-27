import {
  ArrowLeft,
  BadgeCheck,
  Inbox,
  Mail,
  Moon,
  Phone,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  UserPlus,
  Users,
} from '@/components/ui/icons';
import type { Member } from '@samaj/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/layout/BrandMark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Input,
  Modal,
  Select,
  Skeleton,
  SkeletonText,
  Tabs,
  Textarea,
  Tooltip,
  toast,
} from '@/components/ui';
import { MemberCard, MemberCardSkeleton } from '@/features/directory/MemberCard';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

/*
 * Every primitive in every variant and state, for design review. Class names
 * are written out in full (not built from strings) so Tailwind can see them.
 */

const SWATCHES: { name: string; className: string; note?: string }[] = [
  { name: 'canvas', className: 'bg-canvas' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'surface-muted', className: 'bg-surface-muted' },
  { name: 'fg', className: 'bg-fg', note: 'text' },
  { name: 'fg-muted', className: 'bg-fg-muted', note: 'secondary text' },
  { name: 'line', className: 'bg-line' },
  { name: 'line-strong', className: 'bg-line-strong', note: 'input borders' },
  { name: 'primary', className: 'bg-primary', note: 'mor' },
  { name: 'primary-soft', className: 'bg-primary-soft' },
  { name: 'zari', className: 'bg-zari', note: 'fill only' },
  { name: 'zari-soft', className: 'bg-zari-soft' },
  { name: 'kumkum', className: 'bg-kumkum' },
  { name: 'kumkum-soft', className: 'bg-kumkum-soft' },
  { name: 'hero', className: 'bg-hero', note: 'greeting and sign-in band' },
  { name: 'success', className: 'bg-success' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'danger', className: 'bg-danger' },
  { name: 'info', className: 'bg-info', note: 'focus ring' },
];

const TYPE_SCALE: { token: string; size: string; className: string; sample: string }[] = [
  { token: '4xl', size: '2.488rem', className: 'font-display text-4xl font-semibold', sample: 'वार्षिक मेळावा' },
  { token: '3xl', size: '2.074rem', className: 'font-display text-3xl font-semibold', sample: 'Member directory' },
  { token: '2xl', size: '1.728rem', className: 'font-display text-2xl font-semibold', sample: 'समिती सूचना' },
  { token: 'xl', size: '1.44rem', className: 'font-display text-xl font-semibold', sample: 'Chaudhari family, Jalgaon' },
  { token: 'lg', size: '1.2rem', className: 'text-lg font-semibold', sample: 'कार्ड शीर्षक · Card title' },
  { token: 'base', size: '1rem', className: 'text-base', sample: 'Body text sets at 1.6 line height so Devanagari matras have room: नवीन सदस्य नोंदणीसाठी कुटुंबप्रमुखाचे नाव आवश्यक आहे.' },
  { token: 'sm', size: '0.917rem', className: 'text-sm', sample: 'Helper text under inputs · मदत मजकूर' },
  { token: 'xs', size: '0.833rem', className: 'text-xs', sample: 'Badges and timestamps · बॅज' },
];

const RADII = [
  { token: 'xs', className: 'rounded-xs h-6 w-12', use: 'badge' },
  { token: 'sm', className: 'rounded-sm h-touch w-24', use: 'button, input' },
  { token: 'md', className: 'rounded-md h-20 w-32', use: 'card, toast' },
  { token: 'lg', className: 'rounded-lg h-28 w-40', use: 'modal, sheet' },
  { token: 'full', className: 'rounded-full size-12', use: 'avatar, pill' },
];

const SAMPLE_MEMBER: Member = {
  id: 'sample',
  familyId: 'sample-family',
  relation: 'spouse',
  photoUrl: null,
  name: 'सुनीता चौधरी',
  familyHead: 'रमेश चौधरी',
  gotra: 'kashyap',
  place: 'Bhusawal',
  occupation: 'Teacher',
  branch: { id: 'b', name: 'Jalgaon District', nameMr: 'जळगाव जिल्हा' },
  phone: '+919822012345',
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-4 border-t border-line pt-6">
      <h2 id={`${id}-title`} className="font-display text-2xl font-semibold text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const SECTIONS = ['colour', 'type', 'radius', 'icons', 'buttons', 'inputs', 'cards', 'badges', 'chips', 'avatars', 'overlays', 'tabs', 'states'];

export function StyleguidePage() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [modalOpen, setModalOpen] = useState(false);
  const [chip, setChip] = useState('Everyone');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  // Leave the rest of the app in light mode.
  useEffect(() => () => document.documentElement.classList.remove('dark'), []);

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <Tooltip content="Back to the app" side="bottom">
            <Link to="/" className="inline-flex size-touch items-center justify-center rounded-sm text-fg-muted hover:text-fg" aria-label="Back to the app">
              <Icon icon={ArrowLeft} size="lg" />
            </Link>
          </Tooltip>
          <BrandMark />
          <span className="text-sm text-fg-muted">Styleguide</span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <IconButton icon={dark ? Sun : Moon} label={dark ? 'Preview light mode' : 'Preview dark mode'} onClick={() => setDark((d) => !d)} tooltipSide="bottom" />
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-3xl font-semibold">Samaj design system</h1>
          <p className="max-w-prose text-fg-muted">
            Tokens live in <code className="text-sm">apps/web/src/styles/tokens.css</code>. Dark mode tokens are defined but not yet
            designed; the moon button previews them.
          </p>
          <nav aria-label="Sections" className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a key={s} href={`#${s}`} className="rounded-full border border-line px-3 py-1.5 text-sm text-fg-muted capitalize hover:border-line-strong hover:text-fg">
                {s}
              </a>
            ))}
          </nav>
        </div>

        <Section id="colour" title="Colour">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {SWATCHES.map((s) => (
              <li key={s.name} className="flex items-center gap-3">
                <span className={cn('size-11 shrink-0 rounded-sm border border-line', s.className)} />
                <span className="flex flex-col text-sm leading-tight">
                  <code className="font-semibold">{s.name}</code>
                  {s.note && <span className="text-xs text-fg-muted">{s.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="type" title="Type">
          <p className="max-w-prose text-sm text-fg-muted">
            Poppins for display, Noto Sans Devanagari for everything else, both Google Fonts, self-hosted. Ratio 1.2 from 16px, all in rem.
          </p>
          <dl className="flex flex-col divide-y divide-line border-y border-line">
            {TYPE_SCALE.map((row) => (
              <div key={row.token} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:items-baseline sm:gap-4">
                <dt className="text-xs text-fg-muted tabular-nums">
                  <code className="font-semibold text-fg">text-{row.token}</code> {row.size}
                </dt>
                <dd className={cn('max-w-prose break-words', row.className)}>{row.sample}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="radius" title="Radius and elevation">
          <div className="flex flex-wrap items-end gap-6">
            {RADII.map((r) => (
              <div key={r.token} className="flex flex-col gap-2 text-xs text-fg-muted">
                <span className={cn('border border-line-strong bg-surface-muted', r.className)} />
                <span>
                  <code className="font-semibold text-fg">{r.token}</code> {r.use}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="rounded-md bg-surface p-4 text-sm shadow-raised">shadow-raised</div>
            <div className="rounded-md bg-surface p-4 text-sm shadow-overlay">shadow-overlay</div>
          </div>
        </Section>

        <Section id="icons" title="Icons">
          <p className="max-w-prose text-sm text-fg-muted">
            Phosphor, through the icon list in components/ui/icons.ts. Regular for UI, fill for the current tab, duotone for tiles and figures. Colour follows
            the text.
          </p>
          <Row label="sm 16px · inline">
            <span className="flex items-center gap-1 text-sm">
              <Icon icon={Phone} size="sm" /> +91 98220 12345
            </span>
          </Row>
          <Row label="md 20px · buttons and inputs">
            {[Search, UserPlus, Mail, Settings].map((glyph, i) => (
              <Icon key={i} icon={glyph} />
            ))}
          </Row>
          <Row label="lg 24px · navigation">
            {[Users, Inbox, Settings].map((glyph, i) => (
              <Icon key={i} icon={glyph} size="lg" />
            ))}
          </Row>
        </Section>

        <Section id="buttons" title="Buttons">
          <Row label="Variants">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" leadingIcon={Trash2}>
              Remove member
            </Button>
          </Row>
          <Row label="Sizes (all 44px+ tall)">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Row>
          <Row label="With icons">
            <Button leadingIcon={UserPlus}>Add family</Button>
            <Button variant="secondary" leadingIcon={Phone}>
              Call
            </Button>
          </Row>
          <Row label="States">
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </Row>
          <Row label="Icon buttons (hover or focus for the tooltip)">
            <IconButton icon={Plus} label="Add member" />
            <IconButton icon={Settings} label="Settings" variant="secondary" />
            <IconButton icon={UserPlus} label="Invite" variant="primary" />
            <IconButton icon={Trash2} label="Remove" disabled />
          </Row>
          <Row label="Full width">
            <Button fullWidth size="lg">
              Create account
            </Button>
          </Row>
        </Section>

        <Section id="inputs" title="Form controls">
          <div className="grid gap-5 md:grid-cols-2">
            <Input label="Full name" placeholder="Sunita Chaudhari" />
            <Input label="Mobile number" hint="10 digits. You will sign in with this number." leadingIcon={Phone} type="tel" defaultValue="98220 12345" />
            <Input label="Mobile number" error="Enter a 10-digit mobile number starting with 6, 7, 8 or 9." defaultValue="12345" leadingIcon={Phone} />
            <Input label="Search" hideLabel placeholder="Name, place or occupation" leadingIcon={Search} />
            <Input label="Occupation" labelSuffix="optional" placeholder="Teacher" />
            <Input label="Member id" disabled defaultValue="SMJ-00481" />
            <Select label="Branch" placeholder="Choose your branch" defaultValue="">
              <optgroup label="Jalgaon District">
                <option>Bhusawal</option>
                <option>Amalner</option>
              </optgroup>
            </Select>
            <Select label="Gotra" error="Choose a gotra." defaultValue="">
              <option value="">All gotras</option>
              <option>Kashyap</option>
            </Select>
            <Textarea label="Notice" hint="Shown to every member of the branch." placeholder="The annual gathering is on Sunday at the samaj hall." />
            <Textarea label="Notes" disabled defaultValue="Read-only notes." />
          </div>
        </Section>

        <Section id="cards" title="Cards">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardTitle>Outlined</CardTitle>
              <p className="mt-1 text-sm text-fg-muted">The default. Lists and content blocks.</p>
            </Card>
            <Card variant="raised">
              <CardTitle>Raised</CardTitle>
              <p className="mt-1 text-sm text-fg-muted">For the one thing on a page that needs to stand out.</p>
            </Card>
            <Card variant="muted">
              <CardTitle>Muted</CardTitle>
              <p className="mt-1 text-sm text-fg-muted">Grouping inside another surface.</p>
            </Card>
          </div>
          <Row label="In use: directory rows, and their skeleton">
            <ul className="w-full max-w-xl divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-card">
              <MemberCard member={SAMPLE_MEMBER} />
              <MemberCardSkeleton />
            </ul>
          </Row>
        </Section>

        <Section id="badges" title="Badges">
          <Row label="Tones">
            <Badge>Neutral</Badge>
            <Badge tone="primary">Committee</Badge>
            <Badge tone="zari">Kashyap</Badge>
            <Badge tone="kumkum">Wedding</Badge>
            <Badge tone="success" icon={BadgeCheck}>
              Verified
            </Badge>
            <Badge tone="warning">Not yet verified</Badge>
            <Badge tone="danger">Removed</Badge>
            <Badge tone="info">New</Badge>
          </Row>
        </Section>

        <Section id="chips" title="Chips and the zari border">
          <Row label="A filter row: scrolls sideways on phones">
            <ChipRow label="Show members from" className="w-full">
              {['Everyone', 'Amalner', 'Jalgaon District'].map((c) => (
                <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
                  {c}
                </Chip>
              ))}
            </ChipRow>
          </Row>
          <Row label="Zari border, under hero bands">
            <div className="w-full overflow-hidden rounded-md">
              <div className="h-12 bg-hero" />
              <div className="zari-border" />
            </div>
          </Row>
        </Section>

        <Section id="avatars" title="Avatars">
          <Row label="Sizes, initials from Latin and Devanagari names">
            <Avatar name="Anil Wagh" size="sm" />
            <Avatar name="Kavita Dhole" size="md" />
            <Avatar name="सुनीता चौधरी" size="lg" />
            <Avatar name="प्रकाश कराळे" size="xl" />
          </Row>
          <Row label="Broken image falls back to initials">
            <Avatar name="Ramesh Karale" size="lg" src="/does-not-exist.jpg" />
          </Row>
        </Section>

        <Section id="overlays" title="Modal and toast">
          <Row label="Modal: bottom sheet on phones, centred from sm">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
          </Row>
          <Row label="Toasts">
            <Button variant="secondary" onClick={() => toast.success('Member verified', 'Sunita Chaudhari can now see branch notices.')}>
              Success
            </Button>
            <Button variant="secondary" onClick={() => toast.info('Language updated')}>
              Info
            </Button>
            <Button variant="secondary" onClick={() => toast.warning('Slow connection', 'Changes will save when you are back online.')}>
              Warning
            </Button>
            <Button variant="secondary" onClick={() => toast.error("Couldn't save the notice", 'Check your connection and try again.')}>
              Error
            </Button>
          </Row>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Remove Anil Wagh?"
            description="This member will no longer appear in the directory. Their family members stay listed."
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" leadingIcon={Trash2} onClick={() => setModalOpen(false)}>
                  Remove member
                </Button>
              </>
            }
          >
            <Textarea label="Reason" labelSuffix="optional" hint="Only the committee sees this." />
          </Modal>
        </Section>

        <Section id="tabs" title="Tabs">
          <Tabs
            label="Member details"
            items={[
              { id: 'family', label: 'Family', content: <p className="text-sm text-fg-muted">Family members are listed here.</p> },
              { id: 'contact', label: 'Contact', content: <p className="text-sm text-fg-muted">Phone and address, for the branch committee.</p> },
              { id: 'history', label: 'History', content: <p className="text-sm text-fg-muted">Verification and changes.</p> },
            ]}
          />
        </Section>

        <Section id="states" title="Page states">
          <p className="max-w-prose text-sm text-fg-muted">Every list and page has all four: loading, empty, error, loaded.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Row label="Loading">
              <Card className="flex w-full flex-col gap-3">
                <Skeleton className="h-6 w-1/2" />
                <SkeletonText lines={3} />
              </Card>
            </Row>
            <Row label="Empty">
              <EmptyState
                icon={Users}
                title="No members here yet"
                body="Members appear once they sign up and pick this branch. Share the app link with families in your branch."
                className="w-full"
              />
            </Row>
            <Row label="Error with retry">
              <ErrorState
                title="The directory didn't load"
                error={new ApiError(0, 'NETWORK', 'offline', [], 'c3f9a2e1-4b7d')}
                onRetry={() => toast.info('Retrying')}
                className="w-full"
              />
            </Row>
            <Row label="Empty search">
              <EmptyState
                icon={Search}
                title="No one matches that search"
                body="Check the spelling, try the first few letters of a name, or clear the filters."
                action={<Button variant="secondary">Clear filters</Button>}
                className="w-full"
              />
            </Row>
          </div>
        </Section>
      </div>
    </div>
  );
}
