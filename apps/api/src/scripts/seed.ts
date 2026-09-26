/**
 * Fills a development database with sample branches, families and four
 * sign-in accounts (admin, committee, verified member, pending member).
 * Wipes existing data first. Every name and number below is invented.
 */
import argon2 from 'argon2';
import type { BranchKind, FamilyStatus, Gender, GotraId, Relation, Role } from '@samaj/shared';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { connectDb, disconnectDb } from '../config/db';
import { type BranchDoc, BranchModel } from '../models/branch.model';
import { FamilyModel } from '../models/family.model';
import { MemberModel } from '../models/member.model';
import { SessionModel } from '../models/session.model';
import { UserModel } from '../models/user.model';
import { InterestModel } from '../models/interest.model';
import { NoticeModel } from '../models/notice.model';
import { EventModel } from '../models/event.model';
import { RsvpModel } from '../models/rsvp.model';
import { OfficeBearerModel } from '../models/office-bearer.model';
import { ProfileModel } from '../models/profile.model';
import { ineligibility } from '../services/matrimony.service';

if (env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed a production database.\n');
  process.exit(1);
}

interface BranchSeed {
  name: string;
  nameMr: string;
  kind: BranchKind;
  children?: BranchSeed[];
}

// The samaj's first branches. Admins add more from the Branches screen.
const BRANCHES: BranchSeed[] = [
  {
    name: 'Jalgaon District',
    nameMr: 'जळगाव जिल्हा',
    kind: 'district',
    children: [
      { name: 'Amalner', nameMr: 'अमळनेर', kind: 'town' },
      { name: 'Dharangaon', nameMr: 'धरणगाव', kind: 'town' },
    ],
  },
];

const MEN = ['Ramesh', 'Prakash', 'Dilip', 'Suresh', 'Rajendra', 'Vasant', 'Shankar', 'Madhukar', 'Anil', 'Sanjay', 'Vijay', 'Mahesh', 'Nitin', 'Ganesh'];
const WOMEN = ['Sunita', 'Kavita', 'Meena', 'Vaishali', 'Asha', 'Rekha', 'Pooja', 'Jyoti', 'Swati', 'Manisha', 'Sarita', 'Shubhangi', 'Anjali', 'Lata'];
const BOYS = ['Rohit', 'Amit', 'Sagar', 'Akash', 'Omkar', 'Tushar', 'Yash'];
const GIRLS = ['Priya', 'Neha', 'Sneha', 'Komal', 'Gauri', 'Tanvi', 'Rutuja'];
const SURNAMES = ['Chaudhari', 'Karale', 'Dhole', 'Bagul', 'Wagh', 'Sonawane', 'Mahale', 'Shinde'];
// Ids from packages/shared/src/gotras.ts; null is "not listed / not sure".
const GOTRAS: (GotraId | null)[] = ['kashyap', 'bharadwaj', 'vasishtha', 'gautam', 'atri', 'jamadagni', null];
const OCCUPATIONS = ['Oil mill (ghani) owner', 'Farmer', 'Teacher', 'Shopkeeper', 'Engineer', 'Government service', 'Accountant', 'Nurse'];
const EDUCATION = ['B.Com', 'B.A.', 'B.E.', '12th', 'M.Sc.', 'D.Ed.', null];

const DEV_PASSWORD = 'samaj-dev-2026';
const pick = <T>(list: readonly T[], i: number): T => list[i % list.length] as T;
let phoneSeq = 0;
const nextPhone = () => `+9198${String(22000000 + ++phoneSeq * 1379).padStart(8, '0')}`;

interface PersonSeed {
  name: string;
  relation: Relation;
  gender: Gender;
  birthYear: number | null;
  occupation?: string | null;
  education?: string | null;
  phone?: string | null;
}

interface FamilySeed {
  branch: BranchDoc;
  gotra: GotraId | null;
  status: FamilyStatus;
  rejectionReason?: string;
  people: PersonSeed[];
  account?: { role: Role; phone: string };
}

async function insertBranches(seeds: BranchSeed[], parent: BranchDoc | null): Promise<BranchDoc[]> {
  const leaves: BranchDoc[] = [];
  for (const seed of seeds) {
    const doc = await BranchModel.create({
      name: seed.name,
      nameMr: seed.nameMr,
      kind: seed.kind,
      parentId: parent?._id ?? null,
      ancestors: parent ? [...parent.ancestors, parent._id] : [],
    });
    const plain = doc.toObject() as BranchDoc;
    if (seed.children) leaves.push(...(await insertBranches(seed.children, plain)));
    else leaves.push(plain);
  }
  return leaves;
}

async function createFamily(seed: FamilySeed, passwordHash: string) {
  const head = seed.people[0];
  if (!head) throw new Error('A family needs at least one person');
  const userId = seed.account ? new Types.ObjectId() : null;
  const createdAt = new Date(Date.now() - Math.floor(Math.random() * 60) * 86_400_000);

  const history: { at: Date; action: 'created' | 'verified' | 'rejected'; byUserId: null; byName: string; note: string | null }[] = [
    { at: createdAt, action: 'created', byUserId: null, byName: head.name, note: null },
  ];
  if (seed.status === 'verified') history.push({ at: new Date(createdAt.getTime() + 86_400_000), action: 'verified', byUserId: null, byName: 'Committee Demo', note: null });
  if (seed.status === 'rejected') history.push({ at: new Date(createdAt.getTime() + 86_400_000), action: 'rejected', byUserId: null, byName: 'Committee Demo', note: seed.rejectionReason ?? null });

  const family = await FamilyModel.create({
    branchId: seed.branch._id,
    branchAncestors: seed.branch.ancestors,
    place: seed.branch.name,
    gotra: seed.gotra,
    status: seed.status,
    rejectionReason: seed.rejectionReason ?? null,
    submittedAt: createdAt,
    history,
  });

  const members = await MemberModel.insertMany(
    seed.people.map((p, i) => ({
      ...p,
      familyId: family._id,
      isHead: i === 0,
      phone: i === 0 && seed.account ? seed.account.phone : (p.phone ?? null),
      userId: i === 0 ? userId : null,
      branchId: seed.branch._id,
      branchAncestors: seed.branch.ancestors,
      place: family.place,
      gotra: family.gotra,
      familyStatus: family.status,
    })),
  );

  if (seed.account && userId) {
    await UserModel.create({
      _id: userId,
      name: head.name,
      phone: seed.account.phone,
      role: seed.account.role,
      branchId: seed.branch._id,
      passwordHash,
      familyId: family._id,
      memberId: members[0]?._id,
    });
  }
  return members.length;
}

/** A household: head, spouse, and one to three children. */
function household(i: number): PersonSeed[] {
  const surname = pick(SURNAMES, i);
  const headYear = 1958 + (i * 7) % 30;
  const people: PersonSeed[] = [
    { name: `${pick(MEN, i)} ${surname}`, relation: 'head', gender: 'male', birthYear: headYear, occupation: pick(OCCUPATIONS, i), education: pick(EDUCATION, i), phone: nextPhone() },
    { name: `${pick(WOMEN, i)} ${surname}`, relation: 'spouse', gender: 'female', birthYear: headYear + 3, occupation: i % 3 === 0 ? 'Teacher' : null, education: pick(EDUCATION, i + 2) },
  ];
  const children = 1 + (i % 3);
  for (let c = 0; c < children; c++) {
    const isSon = (i + c) % 2 === 0;
    people.push({
      name: `${isSon ? pick(BOYS, i + c) : pick(GIRLS, i + c)} ${surname}`,
      relation: isSon ? 'son' : 'daughter',
      gender: isSon ? 'male' : 'female',
      birthYear: headYear + 26 + c * 3,
      occupation: c === 0 ? pick(OCCUPATIONS, i + 4) : null,
      education: pick(EDUCATION, i + c + 1),
      phone: c === 0 ? nextPhone() : null,
    });
  }
  return people;
}

async function main() {
  await connectDb(env.MONGODB_URI);
  await Promise.all([BranchModel.deleteMany({}), FamilyModel.deleteMany({}), MemberModel.deleteMany({}), UserModel.deleteMany({}), SessionModel.deleteMany({}), ProfileModel.deleteMany({}), InterestModel.deleteMany({}), NoticeModel.deleteMany({}), EventModel.deleteMany({}), RsvpModel.deleteMany({}), OfficeBearerModel.deleteMany({})]);

  const places = await insertBranches(BRANCHES, null);
  const byName = async (name: string) => (await BranchModel.findOne({ name }).orFail().lean()) as BranchDoc;
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  const families: FamilySeed[] = [];
  for (let i = 0; i < 14; i++) {
    families.push({ branch: pick(places, i * 3), gotra: pick(GOTRAS, i), status: 'verified', people: household(i) });
  }
  // Two families written in Devanagari.
  families.push({
    branch: await byName('Amalner'),
    gotra: 'kashyap',
    status: 'verified',
    people: [
      { name: 'रमेश चौधरी', relation: 'head', gender: 'male', birthYear: 1962, occupation: 'घाणी व्यवसाय', education: 'बी.कॉम', phone: nextPhone() },
      { name: 'सुनीता चौधरी', relation: 'spouse', gender: 'female', birthYear: 1966, occupation: 'शिक्षिका', education: 'डी.एड.' },
      { name: 'ओंकार चौधरी', relation: 'son', gender: 'male', birthYear: 1991, occupation: 'अभियंता', education: 'बी.ई.', phone: nextPhone() },
    ],
  });
  families.push({
    branch: await byName('Dharangaon'),
    gotra: 'atri',
    status: 'verified',
    people: [
      { name: 'प्रकाश कराळे', relation: 'head', gender: 'male', birthYear: 1970, occupation: 'शेती', phone: nextPhone() },
      { name: 'ज्योती कराळे', relation: 'spouse', gender: 'female', birthYear: 1974 },
      { name: 'गौरी कराळे', relation: 'daughter', gender: 'female', birthYear: 2001, education: 'एम.एस्सी.' },
    ],
  });
  // Waiting for the Jalgaon committee.
  families.push({ branch: await byName('Dharangaon'), gotra: 'gautam', status: 'pending', people: household(20).slice(0, 3) });
  families.push({ branch: await byName('Amalner'), gotra: null, status: 'pending', people: household(21).slice(0, 2) });
  // Sent back with a reason.
  families.push({
    branch: await byName('Amalner'),
    gotra: 'bharadwaj',
    status: 'rejected',
    rejectionReason: 'Please add the family head’s father and the correct village name.',
    people: household(22).slice(0, 2),
  });

  const accounts: { role: Role; phone: string; name: string; branch: string; status: FamilyStatus }[] = [
    { role: 'superadmin', phone: '+919800000005', name: 'Super Admin Demo', branch: 'Jalgaon District', status: 'verified' },
    { role: 'admin', phone: '+919800000001', name: 'Admin Demo', branch: 'Jalgaon District', status: 'verified' },
    { role: 'committee', phone: '+919800000002', name: 'Committee Demo', branch: 'Jalgaon District', status: 'verified' },
    { role: 'member', phone: '+919800000003', name: 'Member Demo', branch: 'Amalner', status: 'verified' },
    { role: 'member', phone: '+919800000004', name: 'Pending Demo', branch: 'Dharangaon', status: 'pending' },
  ];
  for (const a of accounts) {
    families.push({
      branch: await byName(a.branch),
      gotra: 'kashyap',
      status: a.status,
      account: { role: a.role, phone: a.phone },
      people: [
        { name: a.name, relation: 'head', gender: 'male', birthYear: 1970 },
        { name: `${a.name} Spouse`, relation: 'spouse', gender: 'female', birthYear: 1974 },
        // Member Demo gets a grown son, so that account can try matrimonial search.
        ...(a.name === 'Member Demo' ? [{ name: 'Rohit Demo', relation: 'son' as const, gender: 'male' as const, birthYear: new Date().getFullYear() - 27, occupation: 'Software engineer', education: 'B.E.' }] : []),
      ],
    });
  }

  let people = 0;
  for (const f of families) people += await createFamily(f, passwordHash);

  // Matrimonial profiles for grown, unmarried children of verified families.
  const admin = await UserModel.findOne({ role: 'admin' }).orFail().lean();
  const verified = await FamilyModel.find({ status: 'verified' }).lean();
  let profileCount = 0;
  for (const [i, family] of verified.entries()) {
    const members = await MemberModel.find({ familyId: family._id }).lean();
    const hasSpouse = members.some((m) => m.relation === 'spouse');
    const candidate = members.find((m) => ineligibility(m, hasSpouse) === null);
    if (!candidate?.birthYear) continue;
    const head = members.find((m) => m.isHead);
    // Most go live; every fourth waits for the committee, so the review queue has something in it.
    const live = i % 4 !== 3;
    await ProfileModel.create({
      memberId: candidate._id,
      familyId: family._id,
      heightCm: candidate.gender === 'male' ? 168 + (i % 10) : 152 + (i % 10),
      education: candidate.education ?? 'Graduate',
      occupation: candidate.occupation ?? null,
      income: (['3to6', '6to10', '10to20', null] as const)[i % 4],
      manglik: (['no', 'dontKnow', 'no', 'yes'] as const)[i % 4],
      about: 'Close-knit family. Enjoys reading and travel, and helps with the family business on weekends.',
      expectations: 'Educated, respectful, and from a family that values tradition.',
      contactName: head?.name ?? candidate.name,
      contactPhone: head?.phone ?? '+919800000000',
      status: live ? 'active' : 'pending',
      activatedAt: live ? new Date(Date.now() - i * 86_400_000) : null,
      consentByUserId: admin._id,
      consentAt: new Date(),
      gender: candidate.gender,
      birthYear: candidate.birthYear,
      gotra: family.gotra,
      branchId: family.branchId,
      branchAncestors: family.branchAncestors,
    });
    profileCount++;
  }

  // A few notices from the district committee, so the Community feed isn't empty.
  const secretary = await UserModel.findOne({ role: 'committee' }).orFail().lean();
  const districtBranch = await byName('Jalgaon District');
  const amalnerBranch = await byName('Amalner');
  const day = 86_400_000;
  const noticeSeeds = [
    {
      title: 'Annual gathering on 15 November',
      kind: 'meeting' as const,
      pinned: true,
      branch: districtBranch,
      ago: 1,
      body: 'The annual samaj gathering will be held at the Amalner samaj hall on Sunday, 15 November, from 10 am. Lunch is arranged. Families are requested to register their attendance with their branch committee.',
    },
    {
      title: 'Scholarship forms for 2026-27',
      kind: 'announcement' as const,
      pinned: false,
      branch: districtBranch,
      ago: 3,
      body: 'Students from samaj families who scored above 75% in 10th or 12th can apply for the samaj scholarship. Collect the form from the district office. Last date: 30 October.',
    },
    {
      title: 'Congratulations to Gauri Karale',
      kind: 'celebration' as const,
      pinned: false,
      branch: amalnerBranch,
      ago: 5,
      body: 'Gauri Karale of Amalner has completed her M.Sc. with distinction. The samaj congratulates her and her family.',
    },
    {
      title: 'शोक संदेश',
      kind: 'condolence' as const,
      pinned: false,
      branch: amalnerBranch,
      ago: 8,
      body: 'श्री. वसंत बागुल (अमळनेर) यांचे वृद्धापकाळाने निधन झाले. समाज त्यांच्या कुटुंबाच्या दुःखात सहभागी आहे.',
    },
  ];
  await NoticeModel.insertMany(
    noticeSeeds.map(({ branch, ago, ...n }) => ({
      ...n,
      branchId: branch._id,
      branchAncestors: branch.ancestors,
      authorUserId: secretary._id,
      authorName: secretary.name,
      publishedAt: new Date(Date.now() - ago * day),
    })),
  );

  // Events: two coming up (one with RSVPs already), one past.
  const dharangaonBranch = await byName('Dharangaon');
  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * day);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const [gathering] = await EventModel.insertMany([
    {
      title: 'Annual samaj gathering',
      description: 'Cultural programme, felicitation of students who did well in exams, and lunch. Families are requested to RSVP so the committee can plan food.',
      startsAt: at(20, 10),
      endsAt: at(20, 16),
      venue: 'Samaj hall, Amalner',
      mapUrl: 'https://maps.google.com/?q=Amalner',
      branchId: districtBranch._id,
      branchAncestors: districtBranch.ancestors,
      createdByUserId: secretary._id,
      createdByName: secretary.name,
    },
    {
      title: 'Blood donation camp',
      description: 'Donors must be 18 to 60 years old and weigh over 45 kg. Please eat before you come.',
      startsAt: at(7, 9),
      endsAt: at(7, 13),
      venue: 'Samaj hall, Dharangaon',
      mapUrl: null,
      branchId: dharangaonBranch._id,
      branchAncestors: dharangaonBranch.ancestors,
      createdByUserId: secretary._id,
      createdByName: secretary.name,
    },
    {
      title: 'Ganeshotsav aarti',
      description: 'Evening aarti followed by prasad.',
      startsAt: at(-20, 19),
      endsAt: at(-20, 21),
      venue: 'Samaj mandir, Amalner',
      mapUrl: null,
      branchId: amalnerBranch._id,
      branchAncestors: amalnerBranch.ancestors,
      createdByUserId: secretary._id,
      createdByName: secretary.name,
    },
  ]);
  if (gathering) {
    const attending = await FamilyModel.find({ status: 'verified' }).limit(6).lean();
    await RsvpModel.insertMany(attending.map((f, i) => ({ eventId: gathering._id, familyId: f._id, people: 2 + (i % 4), byUserId: secretary._id })));
  }

  // Office-bearers. The district secretary is the committee demo account, so its number is real in dev.
  const bearers: { branch: typeof districtBranch; post: 'president' | 'vicePresident' | 'secretary' | 'treasurer' | 'member'; name: string; phone: string }[] = [
    { branch: districtBranch, post: 'president', name: 'Ramesh Chaudhari', phone: '+919822101010' },
    { branch: districtBranch, post: 'secretary', name: secretary.name, phone: secretary.phone },
    { branch: districtBranch, post: 'treasurer', name: 'Dilip Karale', phone: '+919822101012' },
    { branch: amalnerBranch, post: 'president', name: 'Prakash Wagh', phone: '+919822101020' },
    { branch: amalnerBranch, post: 'secretary', name: 'Sunita Bagul', phone: '+919822101021' },
    { branch: dharangaonBranch, post: 'secretary', name: 'Vasant Sonawane', phone: '+919822101030' },
  ];
  await OfficeBearerModel.insertMany(
    bearers.map((b) => ({ branchId: b.branch._id, branchAncestors: b.branch.ancestors, post: b.post, name: b.name, phone: b.phone, updatedByUserId: secretary._id })),
  );

  process.stdout.write(
    `\nSeeded ${await BranchModel.countDocuments()} branches, ${families.length} families, ${people} people and ${profileCount} matrimonial profiles.\n\nSign in with any of these (password: ${DEV_PASSWORD}):\n` +
      accounts.map((a) => `  ${a.role.padEnd(10)} ${a.phone.replace('+91', '')}  ${a.name} (${a.branch}, ${a.status})`).join('\n') +
      '\n\n',
  );
  await disconnectDb();
}

main().catch(async (err: unknown) => {
  process.stderr.write(`Seeding failed: ${err instanceof Error ? err.message : String(err)}\n`);
  await disconnectDb();
  process.exit(1);
});
