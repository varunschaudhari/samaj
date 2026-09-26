/**
 * Fills a development database with sample branches, members and three
 * sign-in accounts (admin, committee, member). Wipes existing data first.
 * Every name and number below is invented for development.
 */
import argon2 from 'argon2';
import type { BranchKind, Role } from '@samaj/shared';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { connectDb, disconnectDb } from '../config/db';
import { BranchModel } from '../models/branch.model';
import { MemberModel } from '../models/member.model';
import { SessionModel } from '../models/session.model';
import { UserModel } from '../models/user.model';

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

const BRANCHES: BranchSeed[] = [
  {
    name: 'Jalgaon District',
    nameMr: 'जळगाव जिल्हा',
    kind: 'district',
    children: [
      { name: 'Jalgaon', nameMr: 'जळगाव', kind: 'city' },
      { name: 'Bhusawal', nameMr: 'भुसावळ', kind: 'town' },
      { name: 'Amalner', nameMr: 'अमळनेर', kind: 'town' },
      { name: 'Chopda', nameMr: 'चोपडा', kind: 'town' },
    ],
  },
  {
    name: 'Dhule District',
    nameMr: 'धुळे जिल्हा',
    kind: 'district',
    children: [
      { name: 'Dhule', nameMr: 'धुळे', kind: 'city' },
      { name: 'Shirpur', nameMr: 'शिरपूर', kind: 'town' },
    ],
  },
  {
    name: 'Nashik District',
    nameMr: 'नाशिक जिल्हा',
    kind: 'district',
    children: [
      { name: 'Nashik', nameMr: 'नाशिक', kind: 'city' },
      { name: 'Malegaon', nameMr: 'मालेगाव', kind: 'town' },
    ],
  },
  {
    name: 'Pune District',
    nameMr: 'पुणे जिल्हा',
    kind: 'district',
    children: [
      { name: 'Pune', nameMr: 'पुणे', kind: 'city' },
      { name: 'Pimpri-Chinchwad', nameMr: 'पिंपरी-चिंचवड', kind: 'city' },
    ],
  },
];

const FIRST = ['Sunita', 'Ramesh', 'Anil', 'Kavita', 'Prakash', 'Meena', 'Sanjay', 'Vaishali', 'Dilip', 'Asha', 'Vijay', 'Rekha', 'Suresh', 'Pooja', 'Mahesh', 'Jyoti', 'Nitin', 'Swati', 'Rajendra', 'Manisha'];
const MEN = ['Ramesh', 'Prakash', 'Dilip', 'Suresh', 'Rajendra', 'Vasant', 'Shankar', 'Madhukar'];
const SURNAMES = ['Chaudhari', 'Karale', 'Dhole', 'Bagul', 'Wagh', 'Sonawane', 'Mahale', 'Shinde'];
// Placeholder gotras for development. Replace with the samaj's actual list.
const GOTRAS = ['Kashyap', 'Bharadwaj', 'Vasishtha', 'Gautam', 'Atri', 'Jamadagni', null];
const OCCUPATIONS = ['Oil mill (ghani) owner', 'Farmer', 'Teacher', 'Shopkeeper', 'Engineer', 'Doctor', 'Government service', 'Accountant', 'Nurse', null];

const MARATHI_MEMBERS = [
  { name: 'सुनीता चौधरी', familyHead: 'रमेश चौधरी', occupation: 'शिक्षिका' },
  { name: 'प्रकाश कराळे', familyHead: 'प्रकाश कराळे', occupation: 'घाणी व्यवसाय' },
  { name: 'ज्योती वाघ', familyHead: 'सुरेश वाघ', occupation: null },
  { name: 'महेश सोनवणे', familyHead: 'महेश सोनवणे', occupation: 'शेती' },
];

const DEV_PASSWORD = 'samaj-dev-2026';

async function insertBranches(seeds: BranchSeed[], parent: { _id: Types.ObjectId; ancestors: Types.ObjectId[] } | null) {
  const leaves: { _id: Types.ObjectId; name: string; ancestors: Types.ObjectId[] }[] = [];
  for (const seed of seeds) {
    const doc = await BranchModel.create({
      name: seed.name,
      nameMr: seed.nameMr,
      kind: seed.kind,
      parentId: parent?._id ?? null,
      ancestors: parent ? [...parent.ancestors, parent._id] : [],
    });
    if (seed.children) leaves.push(...(await insertBranches(seed.children, doc)));
    else leaves.push(doc);
  }
  return leaves;
}

async function main() {
  await connectDb(env.MONGODB_URI);
  await Promise.all([BranchModel.deleteMany({}), MemberModel.deleteMany({}), UserModel.deleteMany({}), SessionModel.deleteMany({})]);

  const places = await insertBranches(BRANCHES, null);
  const pick = <T>(list: readonly T[], i: number): T => list[i % list.length] as T;

  const members = [];
  for (let i = 0; i < 44; i++) {
    const place = pick(places, i * 7);
    // Offset the surname each time the first names wrap, so no two members share a full name.
    const surname = pick(SURNAMES, i + Math.floor(i / FIRST.length));
    members.push({
      name: `${pick(FIRST, i)} ${surname}`,
      familyHead: `${pick(MEN, i * 5)} ${surname}`,
      gotra: pick(GOTRAS, i),
      place: place.name,
      occupation: pick(OCCUPATIONS, i * 3),
      phone: `+9198${String(22000000 + i * 1379).padStart(8, '0')}`,
      branchId: place._id,
      branchAncestors: place.ancestors,
      verified: i % 4 !== 0,
    });
  }
  MARATHI_MEMBERS.forEach((m, i) => {
    const place = pick(places, i * 2);
    members.push({ ...m, gotra: pick(GOTRAS, i + 2), place: place.name, phone: `+9197${String(30000000 + i * 911).padStart(8, '0')}`, branchId: place._id, branchAncestors: place.ancestors, verified: true });
  });
  await MemberModel.insertMany(members);

  const jalgaonDistrict = await BranchModel.findOne({ name: 'Jalgaon District' }).orFail();
  const jalgaon = await BranchModel.findOne({ name: 'Jalgaon' }).orFail();
  const pune = await BranchModel.findOne({ name: 'Pune' }).orFail();
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  const accounts: { name: string; phone: string; role: Role; branch: typeof jalgaon }[] = [
    { name: 'Admin Demo', phone: '+919800000001', role: 'admin', branch: jalgaon },
    { name: 'Committee Demo (Jalgaon District)', phone: '+919800000002', role: 'committee', branch: jalgaonDistrict },
    { name: 'Member Demo (Pune)', phone: '+919800000003', role: 'member', branch: pune },
  ];
  for (const a of accounts) {
    const member = await MemberModel.create({ name: a.name, place: a.branch.name, phone: a.phone, branchId: a.branch._id, branchAncestors: a.branch.ancestors, verified: true });
    await UserModel.create({ name: a.name, phone: a.phone, role: a.role, branchId: a.branch._id, passwordHash, memberId: member._id });
  }

  process.stdout.write(
    `\nSeeded ${await BranchModel.countDocuments()} branches and ${members.length + accounts.length} members.\n\nSign in with any of these (password: ${DEV_PASSWORD}):\n` +
      accounts.map((a) => `  ${a.role.padEnd(10)} ${a.phone.replace('+91', '')}  ${a.name}`).join('\n') +
      '\n\n',
  );
  await disconnectDb();
}

main().catch(async (err: unknown) => {
  process.stderr.write(`Seeding failed: ${err instanceof Error ? err.message : String(err)}\n`);
  await disconnectDb();
  process.exit(1);
});
