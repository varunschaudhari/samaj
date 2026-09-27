/**
 * Fills a development database with sample data: districts and towns across
 * Maharashtra, a couple of hundred families of every shape (joint homes,
 * late elders, married sons, daughters married into other families, linked
 * households), matrimonial profiles, notices, events, office-bearers, and
 * sign-in accounts for every role. Wipes existing data first. Every name and
 * number below is invented.
 */
import argon2 from 'argon2';
import { type BranchKind, type FamilyStatus, type Gender, type GotraId, type LinkKind, PRIVACY_NOTICE_VERSION, type Relation, type Role } from '@samaj/shared';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { connectDb, disconnectDb } from '../config/db';
import { type BranchDoc, BranchModel } from '../models/branch.model';
import { FamilyLinkModel, linkPair } from '../models/family-link.model';
import { FamilyModel } from '../models/family.model';
import { InviteModel } from '../models/invite.model';
import { MemberModel } from '../models/member.model';
import { MemberMoveModel } from '../models/member-move.model';
import { SamePersonModel } from '../models/same-person.model';
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

const town = (name: string, nameMr: string): BranchSeed => ({ name, nameMr, kind: 'town' });

// Districts where the samaj is strongest, with their towns. Admins add more from the Branches screen.
const BRANCHES: BranchSeed[] = [
  {
    name: 'Jalgaon District',
    nameMr: 'जळगाव जिल्हा',
    kind: 'district',
    children: [
      town('Amalner', 'अमळनेर'),
      town('Dharangaon', 'धरणगाव'),
      town('Bhusawal', 'भुसावळ'),
      town('Chopda', 'चोपडा'),
      town('Pachora', 'पाचोरा'),
      town('Jamner', 'जामनेर'),
      town('Chalisgaon', 'चाळीसगाव'),
      town('Erandol', 'एरंडोल'),
      town('Parola', 'पारोळा'),
      town('Yawal', 'यावल'),
      town('Jalgaon City', 'जळगाव शहर'),
    ],
  },
  {
    name: 'Dhule District',
    nameMr: 'धुळे जिल्हा',
    kind: 'district',
    children: [town('Dhule City', 'धुळे शहर'), town('Shirpur', 'शिरपूर'), town('Sakri', 'साक्री'), town('Sindkheda', 'शिंदखेडा')],
  },
  {
    name: 'Nandurbar District',
    nameMr: 'नंदुरबार जिल्हा',
    kind: 'district',
    children: [town('Nandurbar', 'नंदुरबार'), town('Shahada', 'शहादा'), town('Navapur', 'नवापूर')],
  },
  {
    name: 'Nashik District',
    nameMr: 'नाशिक जिल्हा',
    kind: 'district',
    children: [town('Nashik City', 'नाशिक शहर'), town('Malegaon', 'मालेगाव'), town('Manmad', 'मनमाड'), town('Yeola', 'येवला'), town('Sinnar', 'सिन्नर')],
  },
  {
    name: 'Chhatrapati Sambhajinagar District',
    nameMr: 'छत्रपती संभाजीनगर जिल्हा',
    kind: 'district',
    children: [town('Chhatrapati Sambhajinagar', 'छत्रपती संभाजीनगर'), town('Vaijapur', 'वैजापूर'), town('Kannad', 'कन्नड'), town('Paithan', 'पैठण')],
  },
  {
    name: 'Buldhana District',
    nameMr: 'बुलढाणा जिल्हा',
    kind: 'district',
    children: [town('Khamgaon', 'खामगाव'), town('Malkapur', 'मलकापूर'), town('Shegaon', 'शेगाव')],
  },
  {
    name: 'Akola District',
    nameMr: 'अकोला जिल्हा',
    kind: 'district',
    children: [town('Akola City', 'अकोला शहर'), town('Akot', 'अकोट')],
  },
  {
    name: 'Pune District',
    nameMr: 'पुणे जिल्हा',
    kind: 'district',
    children: [town('Pune City', 'पुणे शहर'), town('Pimpri-Chinchwad', 'पिंपरी-चिंचवड'), town('Baramati', 'बारामती')],
  },
  {
    name: 'Mumbai & Thane',
    nameMr: 'मुंबई व ठाणे',
    kind: 'district',
    children: [town('Mumbai', 'मुंबई'), town('Thane', 'ठाणे'), town('Kalyan', 'कल्याण')],
  },
  {
    name: 'Nagpur District',
    nameMr: 'नागपूर जिल्हा',
    kind: 'district',
    children: [town('Nagpur City', 'नागपूर शहर'), town('Kamptee', 'कामठी')],
  },
  {
    name: 'Ahilyanagar District',
    nameMr: 'अहिल्यानगर जिल्हा',
    kind: 'district',
    children: [town('Ahilyanagar City', 'अहिल्यानगर शहर'), town('Shrirampur', 'श्रीरामपूर'), town('Sangamner', 'संगमनेर')],
  },
];

const MEN = ['Ramesh', 'Prakash', 'Dilip', 'Suresh', 'Rajendra', 'Vasant', 'Shankar', 'Madhukar', 'Anil', 'Sanjay', 'Vijay', 'Mahesh', 'Nitin', 'Ganesh', 'Sunil', 'Ashok', 'Dnyaneshwar', 'Pandurang', 'Kishor', 'Bhagwan', 'Subhash', 'Gopal', 'Raju', 'Deepak'];
const WOMEN = ['Sunita', 'Kavita', 'Meena', 'Vaishali', 'Asha', 'Rekha', 'Pooja', 'Jyoti', 'Swati', 'Manisha', 'Sarita', 'Shubhangi', 'Anjali', 'Lata', 'Sangita', 'Vandana', 'Usha', 'Mangala', 'Shobha', 'Ujwala'];
const ELDER_MEN = ['Ramrao', 'Bhaurao', 'Kashinath', 'Tukaram', 'Dhondu', 'Vithoba', 'Govinda', 'Namdev', 'Shripat', 'Laxman'];
const ELDER_WOMEN = ['Sitabai', 'Parvatibai', 'Kamalabai', 'Anusaya', 'Janabai', 'Tarabai', 'Rukhmini', 'Yashoda', 'Savitribai', 'Gangubai'];
const BOYS = ['Rohit', 'Amit', 'Sagar', 'Akash', 'Omkar', 'Tushar', 'Yash', 'Pratik', 'Aniket', 'Vaibhav', 'Shubham', 'Kunal', 'Nikhil', 'Harshal', 'Chetan', 'Mayur'];
const GIRLS = ['Priya', 'Neha', 'Sneha', 'Komal', 'Gauri', 'Tanvi', 'Rutuja', 'Pallavi', 'Ashwini', 'Pranali', 'Shraddha', 'Kajal', 'Dipali', 'Rupali', 'Nikita', 'Mrunal'];
const KIDS_BOYS = ['Aarav', 'Arjun', 'Vihaan', 'Shlok', 'Advait', 'Reyansh', 'Atharv', 'Kabir'];
const KIDS_GIRLS = ['Isha', 'Anvi', 'Saanvi', 'Myra', 'Aadya', 'Ira', 'Swara', 'Kiara'];
const SURNAMES = ['Chaudhari', 'Karale', 'Dhole', 'Bagul', 'Wagh', 'Sonawane', 'Mahale', 'Shinde', 'Chavan', 'Patil', 'Deshmukh', 'Jadhav', 'Pawar', 'Mali', 'Borse', 'Khairnar', 'Sonar', 'Thakare', 'Gaikwad', 'Nikam'];
// Ids from packages/shared/src/gotras.ts; null is "not listed / not sure".
const GOTRAS: (GotraId | null)[] = ['kashyap', 'bharadwaj', 'vasishtha', 'gautam', 'atri', 'jamadagni', 'shandilya', 'kaushik', 'garg', 'parashar', null];
const OCCUPATIONS = ['Oil mill (ghani) owner', 'Farmer', 'Teacher', 'Shopkeeper', 'Engineer', 'Government service', 'Accountant', 'Nurse', 'Doctor', 'Software engineer', 'Bank officer', 'Trader', 'Contractor', 'Pharmacist', 'Police'];
const EDUCATION = ['B.Com', 'B.A.', 'B.E.', '12th', 'M.Sc.', 'D.Ed.', 'MBA', 'B.Pharm', 'MBBS', 'Diploma', null];

const DEV_PASSWORD = 'samaj-dev-2026';
const YEAR = new Date().getFullYear();
const pick = <T>(list: readonly T[], i: number): T => list[i % list.length] as T;
let phoneSeq = 0;
const nextPhone = () => `+9198${String(22000000 + ++phoneSeq * 1379).padStart(8, '0')}`;

interface PersonSeed {
  _id?: Types.ObjectId;
  name: string;
  relation: Relation;
  gender: Gender;
  birthYear: number | null;
  occupation?: string | null;
  education?: string | null;
  phone?: string | null;
  parentId?: Types.ObjectId | null;
  partnerId?: Types.ObjectId | null;
  deceased?: boolean;
  deathYear?: number | null;
  adopted?: boolean;
  maidenName?: string | null;
}

interface FamilySeed {
  branch: BranchDoc;
  gotra: GotraId | null;
  status: FamilyStatus;
  rejectionReason?: string;
  people: PersonSeed[];
  account?: { role: Role; phone: string };
  /** Filled in once created. */
  id?: Types.ObjectId;
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
  const createdAt = new Date(Date.now() - Math.floor(Math.random() * 120) * 86_400_000);

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
  seed.id = family._id;

  const members = await MemberModel.insertMany(
    seed.people.map((p, i) => ({
      ...p,
      _id: p._id ?? new Types.ObjectId(),
      familyId: family._id,
      isHead: i === 0,
      phone: p.deceased ? null : i === 0 && seed.account ? seed.account.phone : (p.phone ?? null),
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
      // Demo accounts have agreed to the current privacy notice.
      consentVersion: PRIVACY_NOTICE_VERSION,
      consentAt: new Date(),
    });
  }
  return members.length;
}

const id = () => new Types.ObjectId();

/**
 * One household, shaped by `i` so the directory has every kind: a couple
 * with children; a joint home with grandparents (some late), a married son
 * and grandchildren; a head living with his brother's family; an older head
 * whose wife has passed away.
 */
function household(i: number): PersonSeed[] {
  const surname = pick(SURNAMES, i * 7 + 3);
  const headYear = 1955 + ((i * 7) % 32);
  const head: PersonSeed = {
    _id: id(),
    name: `${pick(MEN, i)} ${surname}`,
    relation: 'head',
    gender: 'male',
    birthYear: headYear,
    occupation: pick(OCCUPATIONS, i),
    education: pick(EDUCATION, i),
    phone: nextPhone(),
  };
  const shape = i % 4;
  const wifeLate = shape === 3;
  const spouse: PersonSeed = {
    _id: id(),
    name: `${pick(WOMEN, i)} ${surname}`,
    relation: 'spouse',
    gender: 'female',
    birthYear: headYear + 3,
    occupation: i % 3 === 0 ? 'Teacher' : null,
    education: pick(EDUCATION, i + 2),
    maidenName: `${pick(WOMEN, i)} ${pick(SURNAMES, i * 3 + 1)}`,
    ...(wifeLate && { deceased: true, deathYear: 2015 + (i % 8) }),
  };
  const people: PersonSeed[] = [head, spouse];

  if (shape === 1) {
    // The head's parents live with them; the father has passed away in some homes.
    const late = i % 3 === 0;
    const father: PersonSeed = { _id: id(), name: `${pick(ELDER_MEN, i)} ${surname}`, relation: 'father', gender: 'male', birthYear: headYear - 27, occupation: 'Farmer', ...(late && { deceased: true, deathYear: 2008 + (i % 12) }) };
    people.push(father, { _id: id(), name: `${pick(ELDER_WOMEN, i)} ${surname}`, relation: 'mother', gender: 'female', birthYear: headYear - 23 });
  }
  if (shape === 2) {
    // His brother's family shares the house.
    const brother: PersonSeed = { _id: id(), name: `${pick(MEN, i + 5)} ${surname}`, relation: 'brother', gender: 'male', birthYear: headYear + 4, occupation: pick(OCCUPATIONS, i + 3), phone: nextPhone() };
    const wife: PersonSeed = { _id: id(), name: `${pick(WOMEN, i + 5)} ${surname}`, relation: 'sisterInLaw', gender: 'female', birthYear: headYear + 7, partnerId: brother._id, maidenName: `${pick(WOMEN, i + 5)} ${pick(SURNAMES, i + 11)}` };
    people.push(brother, wife, {
      name: `${pick(BOYS, i + 9)} ${surname}`,
      relation: 'nephew',
      gender: 'male',
      birthYear: headYear + 33,
      parentId: brother._id,
      education: pick(EDUCATION, i + 4),
    });
  }

  // Children; in older homes the eldest son is married with children of his own.
  const children = 1 + (i % 3);
  const older = headYear < 1972;
  for (let c = 0; c < children; c++) {
    const isSon = (i + c) % 2 === 0;
    const child: PersonSeed = {
      _id: id(),
      name: `${isSon ? pick(BOYS, i + c) : pick(GIRLS, i + c)} ${surname}`,
      relation: isSon ? 'son' : 'daughter',
      gender: isSon ? 'male' : 'female',
      birthYear: headYear + 26 + c * 3,
      occupation: c === 0 ? pick(OCCUPATIONS, i + 4) : null,
      education: pick(EDUCATION, i + c + 1),
      phone: c === 0 ? nextPhone() : null,
      // Now and then a child was adopted.
      adopted: i % 17 === 5 && c === children - 1,
    };
    people.push(child);
    if (isSon && c === 0 && older) {
      const wife: PersonSeed = {
        _id: id(),
        name: `${pick(GIRLS, i + 7)} ${surname}`,
        relation: 'daughterInLaw',
        gender: 'female',
        birthYear: (child.birthYear ?? 1990) + 3,
        partnerId: child._id,
        education: pick(EDUCATION, i + 5),
        maidenName: `${pick(GIRLS, i + 7)} ${pick(SURNAMES, i * 5 + 2)}`,
      };
      people.push(wife);
      const grandkids = 1 + (i % 2);
      for (let g = 0; g < grandkids; g++) {
        const boy = (i + g) % 2 === 0;
        people.push({
          name: `${boy ? pick(KIDS_BOYS, i + g) : pick(KIDS_GIRLS, i + g)} ${surname}`,
          relation: boy ? 'grandson' : 'granddaughter',
          gender: boy ? 'male' : 'female',
          birthYear: Math.min(YEAR - 1, (child.birthYear ?? 1990) + 28 + g * 2),
          parentId: child._id,
        });
      }
    }
  }
  return people;
}

async function link(from: FamilySeed, to: FamilySeed, kind: LinkKind, by: { id: Types.ObjectId; name: string }) {
  if (!from.id || !to.id) return;
  await FamilyLinkModel.create({
    fromFamilyId: from.id,
    toFamilyId: to.id,
    kind,
    status: 'accepted',
    pair: linkPair(from.id, to.id),
    requestedByUserId: by.id,
    requestedByName: by.name,
    acceptedByName: by.name,
    acceptedAt: new Date(),
  });
}

/**
 * A daughter married into another family, the way the app records it: she
 * moves there as a daughter-in-law beside her husband, keeps her name
 * before marriage, and the two families become in-laws.
 */
async function marry(bride: { from: FamilySeed; memberId: Types.ObjectId }, to: FamilySeed, husbandId: Types.ObjectId, surname: string, by: { id: Types.ObjectId; name: string }) {
  const member = await MemberModel.findById(bride.memberId);
  const target = to.id ? await FamilyModel.findById(to.id).lean() : null;
  if (!member || !target || !bride.from.id) return;
  const before = member.name;
  await MemberMoveModel.create({
    memberId: member._id,
    memberName: before,
    fromFamilyId: bride.from.id,
    toFamilyId: target._id,
    relation: 'daughterInLaw',
    fromRelation: member.relation,
    partnerId: husbandId,
    status: 'done',
    requestedByUserId: by.id,
    requestedByName: by.name,
    agreedByName: bride.from.people[0]?.name ?? by.name,
    agreedAt: new Date(),
    decidedByName: by.name,
    decidedAt: new Date(Date.now() - 40 * 86_400_000),
    branchId: target.branchId,
    branchAncestors: target.branchAncestors,
  });
  member.familyId = target._id;
  member.relation = 'daughterInLaw';
  member.partnerId = husbandId;
  member.maidenName = before;
  member.name = `${before.split(' ')[0]} ${surname}`;
  member.branchId = target.branchId;
  member.branchAncestors = target.branchAncestors;
  member.place = target.place;
  member.gotra = target.gotra ?? null;
  member.familyStatus = target.status;
  await member.save();
  if (!(await FamilyLinkModel.exists({ pair: linkPair(bride.from.id, target._id) }))) await link(bride.from, to, 'inLaws', by);
}

async function main() {
  await connectDb(env.MONGODB_URI);
  await Promise.all(
    [
      BranchModel,
      FamilyModel,
      MemberModel,
      UserModel,
      SessionModel,
      ProfileModel,
      InterestModel,
      NoticeModel,
      EventModel,
      RsvpModel,
      OfficeBearerModel,
      FamilyLinkModel,
      MemberMoveModel,
      SamePersonModel,
      InviteModel,
    ].map((m) => (m as typeof BranchModel).deleteMany({})),
  );

  const places = await insertBranches(BRANCHES, null);
  const byName = async (name: string) => (await BranchModel.findOne({ name }).orFail().lean()) as BranchDoc;
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  // Generated households: more in the Jalgaon towns, where the samaj is largest.
  const generated: FamilySeed[] = [];
  const jalgaonTowns = places.slice(0, 11);
  for (let i = 0; i < 190; i++) {
    const branch = i % 3 === 0 ? pick(places, i) : pick(jalgaonTowns, i);
    generated.push({ branch, gotra: pick(GOTRAS, i * 5 + 1), status: 'verified', people: household(i) });
  }
  const families: FamilySeed[] = [...generated];

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
  // Waiting for their committees.
  for (const [i, name] of ['Dharangaon', 'Amalner', 'Shirpur', 'Malegaon', 'Pune City', 'Khamgaon'].entries()) {
    families.push({ branch: await byName(name), gotra: pick(GOTRAS, i + 2), status: 'pending', people: household(300 + i).slice(0, 2 + (i % 3)) });
  }
  // Sent back with a reason.
  families.push({
    branch: await byName('Amalner'),
    gotra: 'bharadwaj',
    status: 'rejected',
    rejectionReason: 'Please add the family head’s father and the correct village name.',
    people: household(322).slice(0, 2),
  });
  families.push({
    branch: await byName('Nashik City'),
    gotra: null,
    status: 'rejected',
    rejectionReason: 'The mobile number belongs to another family. Please check it.',
    people: household(323).slice(0, 3),
  });

  // Sign-in accounts: every role, and committees for several districts.
  const accounts: { role: Role; phone: string; name: string; branch: string; status: FamilyStatus }[] = [
    { role: 'superadmin', phone: '+919800000005', name: 'Super Admin Demo', branch: 'Jalgaon District', status: 'verified' },
    { role: 'admin', phone: '+919800000001', name: 'Admin Demo', branch: 'Jalgaon District', status: 'verified' },
    { role: 'committee', phone: '+919800000002', name: 'Committee Demo', branch: 'Jalgaon District', status: 'verified' },
    { role: 'member', phone: '+919800000003', name: 'Member Demo', branch: 'Amalner', status: 'verified' },
    { role: 'member', phone: '+919800000004', name: 'Pending Demo', branch: 'Dharangaon', status: 'pending' },
    { role: 'committee', phone: '+919800000007', name: 'Dhule Committee Demo', branch: 'Dhule District', status: 'verified' },
    { role: 'committee', phone: '+919800000008', name: 'Nashik Committee Demo', branch: 'Nashik District', status: 'verified' },
    { role: 'committee', phone: '+919800000009', name: 'Pune Committee Demo', branch: 'Pune District', status: 'verified' },
    { role: 'committee', phone: '+919800000013', name: 'Amalner Committee Demo', branch: 'Amalner', status: 'verified' },
    { role: 'member', phone: '+919800000010', name: 'Bhusawal Member Demo', branch: 'Bhusawal', status: 'verified' },
    { role: 'member', phone: '+919800000011', name: 'Nashik Member Demo', branch: 'Nashik City', status: 'verified' },
    { role: 'member', phone: '+919800000012', name: 'Pune Member Demo', branch: 'Pune City', status: 'verified' },
  ];
  const accountFamilies = new Map<string, FamilySeed>();
  // Member Demo's family shows every part of the family tree.
  const md = { head: id(), spouse: id(), father: id(), brother: id(), rohit: id(), sagar: id(), vikas: id() };
  const rich: PersonSeed[] = [
    { _id: md.head, name: 'Member Demo', relation: 'head', gender: 'male', birthYear: 1970 },
    // Listed with a number but no sign-in, to try invite codes and Join your family.
    { _id: md.spouse, name: 'Member Demo Spouse', relation: 'spouse', gender: 'female', birthYear: 1974, phone: '+919800000006', maidenName: 'Sunita Patil' },
    { _id: md.father, name: 'Ramrao Demo', relation: 'father', gender: 'male', birthYear: 1941, deceased: true, deathYear: 2012 },
    { name: 'Sitabai Demo', relation: 'mother', gender: 'female', birthYear: 1946 },
    { _id: md.brother, name: 'Suresh Demo', relation: 'brother', gender: 'male', birthYear: 1973, occupation: 'Teacher' },
    { name: 'Lata Demo', relation: 'sisterInLaw', gender: 'female', birthYear: 1976, partnerId: md.brother, maidenName: 'Lata Wagh' },
    { name: 'Vijay Demo', relation: 'nephew', gender: 'male', birthYear: 2000, parentId: md.brother },
    // A grown son, so this account can try matrimonial search.
    { _id: md.rohit, name: 'Rohit Demo', relation: 'son', gender: 'male', birthYear: YEAR - 27, occupation: 'Software engineer', education: 'B.E.' },
    { _id: md.sagar, name: 'Sagar Demo', relation: 'son', gender: 'male', birthYear: 1995, occupation: 'Farmer' },
    { name: 'Neha Demo', relation: 'daughterInLaw', gender: 'female', birthYear: 1998, partnerId: md.sagar, maidenName: 'Neha Chavan' },
    { name: 'Isha Demo', relation: 'granddaughter', gender: 'female', birthYear: 2022, parentId: md.sagar, adopted: true },
    // Vikas has his own household too, linked below; listed here as well, the tree shows him once.
    { _id: md.vikas, name: 'Vikas Demo', relation: 'son', gender: 'male', birthYear: 1993 },
  ];
  for (const a of accounts) {
    const people: PersonSeed[] =
      a.name === 'Member Demo'
        ? rich
        : [
            { name: a.name, relation: 'head', gender: 'male', birthYear: 1970 },
            { name: `${a.name} Spouse`, relation: 'spouse', gender: 'female', birthYear: 1974 },
            // Admin Demo's daughter marries Rohit Demo below.
            ...(a.name === 'Admin Demo' ? [{ name: 'Kavya Patil', relation: 'daughter' as const, gender: 'female' as const, birthYear: YEAR - 25, education: 'M.A.', occupation: 'Teacher' }] : []),
          ];
    const seed: FamilySeed = { branch: await byName(a.branch), gotra: 'kashyap', status: a.status, account: { role: a.role, phone: a.phone }, people };
    accountFamilies.set(a.name, seed);
    families.push(seed);
  }
  // Vikas Demo's own household, linked as Member Demo's son's family.
  const vikasHome: FamilySeed = {
    branch: await byName('Amalner'),
    gotra: 'kashyap',
    status: 'verified',
    people: [
      { name: 'Vikas Member Demo', relation: 'head', gender: 'male', birthYear: 1993, occupation: 'Engineer' },
      { name: 'Swati Demo', relation: 'spouse', gender: 'female', birthYear: 1996, maidenName: 'Swati Borse' },
      { name: 'Arjun Demo', relation: 'son', gender: 'male', birthYear: 2023 },
    ],
  };
  families.push(vikasHome);

  let people = 0;
  for (const f of families) people += await createFamily(f, passwordHash);

  const admin = await UserModel.findOne({ role: 'admin' }).orFail().lean();
  const by = { id: admin._id, name: admin.name };

  // Linked households: a son who set up his own home, brothers living apart, grandparents in the village.
  let links = 0;
  for (let i = 0; i + 1 < generated.length; i += 6) {
    const parents = generated[i] as FamilySeed;
    const child = generated[i + 1] as FamilySeed;
    await link(child, parents, 'parents', by);
    links++;
    const sibling = generated[i + 2];
    if (sibling && i % 12 === 0) {
      await link(child, sibling, 'siblings', by);
      links++;
    }
  }
  // Member Demo's circle.
  const memberDemo = accountFamilies.get('Member Demo') as FamilySeed;
  await link(vikasHome, memberDemo, 'parents', by);
  await link(memberDemo, accountFamilies.get('Bhusawal Member Demo') as FamilySeed, 'relatives', by);
  links += 2;

  // Daughters married into other families, with the move record and the in-laws link.
  let marriages = 0;
  const adminFamily = accountFamilies.get('Admin Demo') as FamilySeed;
  const kavya = await MemberModel.findOne({ familyId: adminFamily.id, name: 'Kavya Patil' }).lean();
  if (kavya) {
    await marry({ from: adminFamily, memberId: kavya._id }, memberDemo, md.rohit, 'Demo', by);
    marriages++;
  }
  for (let i = 3; i + 10 < generated.length; i += 9) {
    const from = generated[i] as FamilySeed;
    const to = generated[i + 10] as FamilySeed;
    const daughter = await MemberModel.findOne({ familyId: from.id, relation: 'daughter', birthYear: { $lte: YEAR - 22 } }).lean();
    const groom = await MemberModel.findOne({ familyId: to.id, relation: 'son', gender: 'male' }).lean();
    const hasWife = groom ? await MemberModel.exists({ familyId: to.id, partnerId: groom._id }) : true;
    if (!daughter || !groom || hasWife) continue;
    await marry({ from, memberId: daughter._id }, to, groom._id, groom.name.split(' ').at(-1) ?? '', by);
    marriages++;
  }

  // Matrimonial profiles for grown, unmarried children of verified families.
  const verified = await FamilyModel.find({ status: 'verified' }).lean();
  let profileCount = 0;
  for (const [i, family] of verified.entries()) {
    const members = await MemberModel.find({ familyId: family._id }).lean();
    const hasSpouse = members.some((m) => m.relation === 'spouse');
    const candidate = members.find((m) => !m.deceased && !members.some((x) => x.partnerId && String(x.partnerId) === String(m._id)) && ineligibility(m, hasSpouse) === null);
    if (!candidate?.birthYear) continue;
    const head = members.find((m) => m.isHead);
    // Most go live; every fourth waits for the committee, so the review queue has something in it.
    const live = i % 4 !== 3;
    await ProfileModel.create({
      memberId: candidate._id,
      familyId: family._id,
      heightCm: candidate.gender === 'male' ? 165 + (i % 14) : 150 + (i % 12),
      education: candidate.education ?? 'Graduate',
      occupation: candidate.occupation ?? null,
      income: (['3to6', '6to10', '10to20', null, 'above20', 'below3'] as const)[i % 6],
      manglik: (['no', 'dontKnow', 'no', 'yes'] as const)[i % 4],
      about: pick(
        [
          'Close-knit family. Enjoys reading and travel, and helps with the family business on weekends.',
          'Works in the city and visits the village often. Likes cricket, music and cooking.',
          'Simple, family-minded, and fond of trekking and devotional music.',
        ],
        i,
      ),
      expectations: pick(['Educated, respectful, and from a family that values tradition.', 'Someone who is kind and open to living in the city.', 'A caring partner from a good family; job not required.'], i),
      contactName: head?.name ?? candidate.name,
      contactPhone: head?.phone ?? '+919800000000',
      status: live ? 'active' : 'pending',
      activatedAt: live ? new Date(Date.now() - (i % 60) * 86_400_000) : null,
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

  // Notices from the committees, so every district's Community feed has something.
  const secretary = await UserModel.findOne({ role: 'committee' }).orFail().lean();
  const day = 86_400_000;
  const noticeSeeds: { title: string; kind: 'meeting' | 'announcement' | 'celebration' | 'condolence'; pinned: boolean; branch: string; ago: number; body: string }[] = [
    {
      title: 'Annual gathering on 15 November',
      kind: 'meeting',
      pinned: true,
      branch: 'Jalgaon District',
      ago: 1,
      body: 'The annual samaj gathering will be held at the Amalner samaj hall on Sunday, 15 November, from 10 am. Lunch is arranged. Families are requested to register their attendance with their branch committee.',
    },
    {
      title: 'Scholarship forms for 2026-27',
      kind: 'announcement',
      pinned: false,
      branch: 'Jalgaon District',
      ago: 3,
      body: 'Students from samaj families who scored above 75% in 10th or 12th can apply for the samaj scholarship. Collect the form from the district office. Last date: 30 October.',
    },
    { title: 'Congratulations to Gauri Karale', kind: 'celebration', pinned: false, branch: 'Amalner', ago: 5, body: 'Gauri Karale of Amalner has completed her M.Sc. with distinction. The samaj congratulates her and her family.' },
    { title: 'शोक संदेश', kind: 'condolence', pinned: false, branch: 'Amalner', ago: 8, body: 'श्री. वसंत बागुल (अमळनेर) यांचे वृद्धापकाळाने निधन झाले. समाज त्यांच्या कुटुंबाच्या दुःखात सहभागी आहे.' },
    { title: 'Vadhu-var melava in Dhule', kind: 'meeting', pinned: true, branch: 'Dhule District', ago: 2, body: 'A vadhu-var parichay melava for the Dhule and Nandurbar districts will be held at the Dhule samaj bhavan on 22 November. Families with profiles on the app can register at the venue.' },
    { title: 'नाशिक शाखेची नवी कार्यकारिणी', kind: 'announcement', pinned: false, branch: 'Nashik District', ago: 4, body: 'नाशिक जिल्हा शाखेची नवी कार्यकारिणी जाहीर झाली आहे. सर्व पदाधिकाऱ्यांचे अभिनंदन.' },
    { title: 'Health camp in Pune', kind: 'announcement', pinned: false, branch: 'Pune District', ago: 6, body: 'A free health check-up camp for senior members will be held at the Pimpri-Chinchwad samaj hall on Sunday morning. Please bring earlier reports if any.' },
    { title: 'Congratulations, Class 10 toppers', kind: 'celebration', pinned: false, branch: 'Bhusawal', ago: 10, body: 'Three students from Bhusawal scored above 95% in the Class 10 board exams. The branch will felicitate them at the Diwali get-together.' },
  ];
  await NoticeModel.insertMany(
    await Promise.all(
      noticeSeeds.map(async ({ branch, ago, ...n }) => {
        const b = await byName(branch);
        return { ...n, branchId: b._id, branchAncestors: b.ancestors, authorUserId: secretary._id, authorName: secretary.name, publishedAt: new Date(Date.now() - ago * day) };
      }),
    ),
  );

  // Events: some coming up (one with RSVPs already), one past.
  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * day);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const eventSeeds = [
    { title: 'Annual samaj gathering', description: 'Cultural programme, felicitation of students who did well in exams, and lunch. Families are requested to RSVP so the committee can plan food.', start: at(20, 10), end: at(20, 16), venue: 'Samaj hall, Amalner', mapUrl: 'https://maps.google.com/?q=Amalner', branch: 'Jalgaon District' },
    { title: 'Blood donation camp', description: 'Donors must be 18 to 60 years old and weigh over 45 kg. Please eat before you come.', start: at(7, 9), end: at(7, 13), venue: 'Samaj hall, Dharangaon', mapUrl: null, branch: 'Dharangaon' },
    { title: 'Ganeshotsav aarti', description: 'Evening aarti followed by prasad.', start: at(-20, 19), end: at(-20, 21), venue: 'Samaj mandir, Amalner', mapUrl: null, branch: 'Amalner' },
    { title: 'Vadhu-var parichay melava', description: 'Introductions for families looking for a match. Bring a printed profile if you have one.', start: at(35, 10), end: at(35, 17), venue: 'Samaj bhavan, Dhule', mapUrl: 'https://maps.google.com/?q=Dhule', branch: 'Dhule District' },
    { title: 'Diwali get-together', description: 'Sweets, rangoli competition for children and felicitation of students.', start: at(28, 17), end: at(28, 21), venue: 'Community hall, Bhusawal', mapUrl: null, branch: 'Bhusawal' },
    { title: 'Senior members’ health camp', description: 'Free check-ups for members above 60: blood pressure, sugar and eyes.', start: at(12, 9), end: at(12, 13), venue: 'Samaj hall, Pimpri-Chinchwad', mapUrl: null, branch: 'Pune District' },
  ];
  const events = await EventModel.insertMany(
    await Promise.all(
      eventSeeds.map(async (e) => {
        const b = await byName(e.branch);
        return {
          title: e.title,
          description: e.description,
          startsAt: e.start,
          endsAt: e.end,
          venue: e.venue,
          mapUrl: e.mapUrl,
          branchId: b._id,
          branchAncestors: b.ancestors,
          createdByUserId: secretary._id,
          createdByName: secretary.name,
        };
      }),
    ),
  );
  const gathering = events[0];
  if (gathering) {
    const attending = await FamilyModel.find({ status: 'verified' }).limit(12).lean();
    await RsvpModel.insertMany(attending.map((f, i) => ({ eventId: gathering._id, familyId: f._id, people: 2 + (i % 4), byUserId: secretary._id })));
  }

  // Office-bearers. The Jalgaon district secretary is the committee demo account, so its number is real in dev.
  const bearers: { branch: string; post: 'president' | 'vicePresident' | 'secretary' | 'treasurer' | 'member'; name: string; phone: string }[] = [
    { branch: 'Jalgaon District', post: 'president', name: 'Ramesh Chaudhari', phone: '+919822101010' },
    { branch: 'Jalgaon District', post: 'secretary', name: secretary.name, phone: secretary.phone },
    { branch: 'Jalgaon District', post: 'treasurer', name: 'Dilip Karale', phone: '+919822101012' },
    { branch: 'Amalner', post: 'president', name: 'Prakash Wagh', phone: '+919822101020' },
    { branch: 'Amalner', post: 'secretary', name: 'Sunita Bagul', phone: '+919822101021' },
    { branch: 'Dharangaon', post: 'secretary', name: 'Vasant Sonawane', phone: '+919822101030' },
    { branch: 'Bhusawal', post: 'president', name: 'Kishor Mahale', phone: '+919822101040' },
    { branch: 'Dhule District', post: 'president', name: 'Subhash Borse', phone: '+919822101050' },
    { branch: 'Dhule District', post: 'secretary', name: 'Vandana Khairnar', phone: '+919822101051' },
    { branch: 'Nashik District', post: 'president', name: 'Ashok Sonar', phone: '+919822101060' },
    { branch: 'Nashik District', post: 'vicePresident', name: 'Mangala Thakare', phone: '+919822101061' },
    { branch: 'Pune District', post: 'president', name: 'Deepak Gaikwad', phone: '+919822101070' },
    { branch: 'Pune District', post: 'treasurer', name: 'Usha Nikam', phone: '+919822101071' },
  ];
  await OfficeBearerModel.insertMany(
    await Promise.all(
      bearers.map(async (b) => {
        const branch = await byName(b.branch);
        return { branchId: branch._id, branchAncestors: branch.ancestors, post: b.post, name: b.name, phone: b.phone, updatedByUserId: secretary._id };
      }),
    ),
  );

  process.stdout.write(
    `\nSeeded ${await BranchModel.countDocuments()} branches, ${families.length} families, ${people} people, ${links} family links, ${marriages} marriages between families and ${profileCount} matrimonial profiles.\n\nSign in with any of these (password: ${DEV_PASSWORD}):\n` +
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
