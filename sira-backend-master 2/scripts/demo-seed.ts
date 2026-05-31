/**
 * Demo seed — fills every module with realistic Egyptian real-estate data.
 * Run: npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/demo-seed.ts
 */
import { PrismaClient, UserStatus, SalesTitle, TeamStatus, CampaignPlatform, CampaignStatus, LeadStatus, LeadPriority, LeadType, AssignmentMode, MeetingType, MeetingStatus, UnitStatus, ResaleUnitStatus, UnitPreviewStatus, CallStatus, CallType, Platform, DataQuality } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();
const PASS = 'Demo@123';

// ─── helpers ────────────────────────────────────────────────────────────────
const hash = (p: string) => bcrypt.hash(p, 10);
const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  console.log('🌱  Starting demo seed…');

  // ── 1. ROLES ──────────────────────────────────────────────────────────────
  const roleDefs = [
    { name: 'super_admin',       displayName: 'Super Admin',       hierarchyLevel: 0 },
    { name: 'operation_manager', displayName: 'Operation Manager', hierarchyLevel: 1 },
    { name: 'sales_manager',     displayName: 'Sales Manager',     hierarchyLevel: 2 },
    { name: 'tech_lead',         displayName: 'Team Leader',       hierarchyLevel: 3 },
    { name: 'sales',             displayName: 'Sales',             hierarchyLevel: 4 },
  ];
  for (const r of roleDefs) {
    await prisma.role.upsert({ where: { name: r.name }, update: {}, create: r });
  }
  const roles = Object.fromEntries(
    (await prisma.role.findMany()).map((r) => [r.name, r]),
  );
  console.log('✅  Roles');

  // ── 2. USERS ──────────────────────────────────────────────────────────────
  const makeUser = async (data: {
    email: string; firstName: string; lastName: string;
    phone: string; role: string; salary?: number; title?: SalesTitle;
  }) => prisma.user.upsert({
    where: { email: data.email },
    update: {},
    create: {
      email: data.email,
      passwordHash: await hash(PASS),
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      roleId: roles[data.role].id,
      salary: data.salary ?? null,
      title: data.title ?? null,
      status: UserStatus.active,
    },
  });

  const admin   = await makeUser({ email: 'admin@sira.com',   firstName: 'أحمد',    lastName: 'السيد',    phone: '01001234567', role: 'super_admin',       salary: 25000 });
  const ops     = await makeUser({ email: 'ops@sira.com',     firstName: 'محمد',    lastName: 'عمر',      phone: '01101234567', role: 'operation_manager', salary: 18000 });
  const sm1     = await makeUser({ email: 'sm1@sira.com',     firstName: 'سارة',    lastName: 'خالد',     phone: '01201234567', role: 'sales_manager',     salary: 15000 });
  const sm2     = await makeUser({ email: 'sm2@sira.com',     firstName: 'عمر',     lastName: 'حسن',      phone: '01501234567', role: 'sales_manager',     salary: 15000 });
  const tl1     = await makeUser({ email: 'tl1@sira.com',     firstName: 'ياسمين',  lastName: 'مصطفى',    phone: '01221234567', role: 'tech_lead',         salary: 12000 });
  const tl2     = await makeUser({ email: 'tl2@sira.com',     firstName: 'كريم',    lastName: 'إبراهيم',  phone: '01281234567', role: 'tech_lead',         salary: 12000 });
  const s1      = await makeUser({ email: 's1@sira.com',      firstName: 'نور',     lastName: 'علي',      phone: '01001112233', role: 'sales', salary: 8000,  title: SalesTitle.advisor });
  const s2      = await makeUser({ email: 's2@sira.com',      firstName: 'مينا',    lastName: 'جورج',     phone: '01001223344', role: 'sales', salary: 8000,  title: SalesTitle.advisor });
  const s3      = await makeUser({ email: 's3@sira.com',      firstName: 'فاطمة',   lastName: 'محمود',    phone: '01001334455', role: 'sales', salary: 9000,  title: SalesTitle.consultant });
  const s4      = await makeUser({ email: 's4@sira.com',      firstName: 'علي',     lastName: 'أحمد',     phone: '01001445566', role: 'sales', salary: 9000,  title: SalesTitle.consultant });
  const s5      = await makeUser({ email: 's5@sira.com',      firstName: 'ريم',     lastName: 'سامي',     phone: '01001556677', role: 'sales', salary: 8500,  title: SalesTitle.advisor });
  const s6      = await makeUser({ email: 's6@sira.com',      firstName: 'باسم',    lastName: 'وليد',     phone: '01001667788', role: 'sales', salary: 8500,  title: SalesTitle.advisor });
  console.log('✅  Users (12)');

  // ── 3. TEAMS ──────────────────────────────────────────────────────────────
  const team1 = await prisma.team.create({
    data: { name: 'فريق النيل', teamLeaderId: tl1.id, status: TeamStatus.active },
  });
  const team2 = await prisma.team.create({
    data: { name: 'فريق الهرم', teamLeaderId: tl2.id, status: TeamStatus.active },
  });

  // assign sales to teams via TeamMember + user.teamId
  const addMember = (teamId: bigint, userId: bigint) =>
    prisma.teamMember.create({ data: { teamId, userId } });

  await Promise.all([
    addMember(team1.id, s1.id), addMember(team1.id, s2.id), addMember(team1.id, s3.id),
    addMember(team2.id, s4.id), addMember(team2.id, s5.id), addMember(team2.id, s6.id),
  ]);
  await prisma.user.update({ where: { id: s1.id }, data: { teamId: team1.id } });
  await prisma.user.update({ where: { id: s2.id }, data: { teamId: team1.id } });
  await prisma.user.update({ where: { id: s3.id }, data: { teamId: team1.id } });
  await prisma.user.update({ where: { id: s4.id }, data: { teamId: team2.id } });
  await prisma.user.update({ where: { id: s5.id }, data: { teamId: team2.id } });
  await prisma.user.update({ where: { id: s6.id }, data: { teamId: team2.id } });
  console.log('✅  Teams (2) + members');

  // ── 4. LEAD SOURCES ───────────────────────────────────────────────────────
  const lsFb   = await prisma.leadSource.create({ data: { name: 'إعلانات فيسبوك', type: 'fresh',     platform: 'facebook' } });
  const lsIg   = await prisma.leadSource.create({ data: { name: 'إعلانات إنستجرام', type: 'fresh',   platform: 'instagram' } });
  const lsPf   = await prisma.leadSource.create({ data: { name: 'Property Finder', type: 'fresh',    platform: 'property_finder' } });
  const lsDub  = await prisma.leadSource.create({ data: { name: 'Dubizzle',        type: 'fresh',    platform: 'dubizzle' } });
  const lsCold = await prisma.leadSource.create({ data: { name: 'مكالمات باردة',   type: 'cold_call' } });
  const lsRef  = await prisma.leadSource.create({ data: { name: 'إحالة عميل',      type: 'referral'  } });
  console.log('✅  Lead Sources (6)');

  // ── 5. CAMPAIGNS ──────────────────────────────────────────────────────────
  const camp1 = await prisma.campaign.create({ data: {
    name: 'حملة القاهرة الجديدة - مايو',
    platform: CampaignPlatform.facebook,
    status: CampaignStatus.active,
    budget: 15000,
    startDate: daysAgo(30),
    endDate: daysFromNow(30),
    leadSourceId: lsFb.id,
    timeLimit: 48,
  }});
  const camp2 = await prisma.campaign.create({ data: {
    name: 'حملة أكتوبر الجديدة - إنستجرام',
    platform: CampaignPlatform.instagram,
    status: CampaignStatus.active,
    budget: 10000,
    startDate: daysAgo(15),
    endDate: daysFromNow(45),
    leadSourceId: lsIg.id,
    timeLimit: 24,
  }});
  const camp3 = await prisma.campaign.create({ data: {
    name: 'Property Finder - شركة الرحاب',
    platform: CampaignPlatform.property_finder,
    status: CampaignStatus.active,
    budget: 8000,
    startDate: daysAgo(60),
    leadSourceId: lsPf.id,
  }});
  const camp4 = await prisma.campaign.create({ data: {
    name: 'Dubizzle - وحدات التجمع',
    platform: CampaignPlatform.dubizzle,
    status: CampaignStatus.paused,
    budget: 5000,
    startDate: daysAgo(90),
    endDate: daysAgo(10),
    leadSourceId: lsDub.id,
  }});
  console.log('✅  Campaigns (4)');

  // ── 6. DATA BATCHES ───────────────────────────────────────────────────────
  const batch1 = await prisma.dataBatch.create({ data: {
    batchName: 'داتا معرض سيتي سكيب 2024',
    dataSource: 'معرض سيتي سكيب',
    purchaseDate: daysAgo(45),
    purchasePrice: 3000,
    totalRecords: 200,
    quality: DataQuality.high,
    createdBy: ops.id,
    importedCount: 200,
    skippedDuplicateCount: 12,
    failedImportCount: 3,
  }});
  const batch2 = await prisma.dataBatch.create({ data: {
    batchName: 'داتا مكالمات باردة - أبريل',
    dataSource: 'قاعدة بيانات داخلية',
    purchaseDate: daysAgo(20),
    purchasePrice: 0,
    totalRecords: 150,
    quality: DataQuality.medium,
    createdBy: ops.id,
    importedCount: 150,
    skippedDuplicateCount: 8,
    failedImportCount: 2,
  }});
  console.log('✅  Data Batches (2)');

  // ── 7. LEADS ──────────────────────────────────────────────────────────────
  const salesUsers = [s1, s2, s3, s4, s5, s6];
  const allTeams = [team1.id, team2.id];
  const sources = [lsFb, lsIg, lsPf, lsDub, lsCold, lsRef];
  const campaigns = [camp1, camp2, camp3, camp4];

  const leadDefs = [
    // Assigned & active
    { first: 'يوسف',   last: 'إبراهيم', phone: '01011111111', status: LeadStatus.follow_up,       priority: LeadPriority.high,   assignTo: s1, team: team1 },
    { first: 'هناء',   last: 'سالم',    phone: '01022222222', status: LeadStatus.qualified,        priority: LeadPriority.high,   assignTo: s1, team: team1 },
    { first: 'طارق',   last: 'منصور',   phone: '01033333333', status: LeadStatus.interested,       priority: LeadPriority.medium, assignTo: s2, team: team1 },
    { first: 'منى',    last: 'فوزي',    phone: '01044444444', status: LeadStatus.contacted,        priority: LeadPriority.medium, assignTo: s2, team: team1 },
    { first: 'عادل',   last: 'رضا',     phone: '01055555555', status: LeadStatus.follow_up,        priority: LeadPriority.urgent, assignTo: s3, team: team1 },
    { first: 'دينا',   last: 'حسين',    phone: '01066666666', status: LeadStatus.no_answer,        priority: LeadPriority.low,    assignTo: s3, team: team1 },
    { first: 'هشام',   last: 'عطية',    phone: '01077777777', status: LeadStatus.meeting_cancelled,priority: LeadPriority.medium, assignTo: s4, team: team2 },
    { first: 'إيمان',  last: 'جابر',    phone: '01088888888', status: LeadStatus.qualified,        priority: LeadPriority.high,   assignTo: s4, team: team2 },
    { first: 'وليد',   last: 'ناصر',    phone: '01099999999', status: LeadStatus.follow_up,        priority: LeadPriority.medium, assignTo: s5, team: team2 },
    { first: 'سمر',    last: 'زكي',     phone: '01012345678', status: LeadStatus.interested,       priority: LeadPriority.high,   assignTo: s5, team: team2 },
    { first: 'كمال',   last: 'نجيب',    phone: '01023456789', status: LeadStatus.contacted,        priority: LeadPriority.medium, assignTo: s6, team: team2 },
    { first: 'رانيا',  last: 'طه',      phone: '01034567890', status: LeadStatus.follow_up,        priority: LeadPriority.urgent, assignTo: s6, team: team2 },
    // Converted / purchased
    { first: 'أسامة',  last: 'حلمي',    phone: '01045678901', status: LeadStatus.purchased,        priority: LeadPriority.high,   assignTo: s1, team: team1 },
    { first: 'نادية',  last: 'شوقي',    phone: '01056789012', status: LeadStatus.converted,        priority: LeadPriority.high,   assignTo: s2, team: team1 },
    // Cold / lost
    { first: 'عبد الله', last: 'بكر',   phone: '01067890123', status: LeadStatus.not_interested,   priority: LeadPriority.low,    assignTo: null, team: null },
    { first: 'لمياء',  last: 'صبري',    phone: '01078901234', status: LeadStatus.wrong_number,     priority: LeadPriority.low,    assignTo: null, team: null },
    { first: 'جمال',   last: 'عبد الحميد', phone: '01089012345', status: LeadStatus.lost,          priority: LeadPriority.low,    assignTo: null, team: null },
    { first: 'سهير',   last: 'رفاعي',   phone: '01090123456', status: LeadStatus.switched_off,     priority: LeadPriority.low,    assignTo: s3, team: team1 },
    // New / unassigned
    { first: 'محسن',   last: 'قاسم',    phone: '01011112222', status: LeadStatus.new_lead,         priority: LeadPriority.medium, assignTo: null, team: null },
    { first: 'نجوى',   last: 'صالح',    phone: '01022223333', status: LeadStatus.new_lead,         priority: LeadPriority.medium, assignTo: null, team: null },
    { first: 'ثروت',   last: 'الجندي',  phone: '01033334444', status: LeadStatus.new_lead,         priority: LeadPriority.high,   assignTo: null, team: null },
    { first: 'فيروز',  last: 'البنا',   phone: '01044445555', status: LeadStatus.rotation,         priority: LeadPriority.medium, assignTo: null, team: null },
    { first: 'خالد',   last: 'درويش',   phone: '01055556666', status: LeadStatus.cold_call,        priority: LeadPriority.low,    assignTo: s4, team: team2 },
    { first: 'عبير',   last: 'أمين',    phone: '01066667777', status: LeadStatus.assigned,         priority: LeadPriority.medium, assignTo: s5, team: team2 },
    { first: 'ربيع',   last: 'حداد',    phone: '01077778888', status: LeadStatus.follow_up,        priority: LeadPriority.high,   assignTo: s1, team: team1, starred: true },
    { first: 'وفاء',   last: 'زغلول',   phone: '01088889999', status: LeadStatus.qualified,        priority: LeadPriority.urgent, assignTo: s2, team: team1, starred: true },
  ];

  const createdLeads: any[] = [];
  for (let i = 0; i < leadDefs.length; i++) {
    const d = leadDefs[i] as any;
    const src = sources[i % sources.length];
    const camp = i < 12 ? campaigns[i % campaigns.length] : null;
    const lead = await prisma.lead.create({ data: {
      firstName: d.first,
      lastName: d.last,
      phone: d.phone,
      email: `lead${i + 1}@demo.com`,
      leadSourceId: src.id,
      campaignId: camp?.id ?? null,
      dataBatchId: i < 10 ? batch1.id : i < 20 ? batch2.id : null,
      status: d.status,
      priority: d.priority,
      isStarred: d.starred ?? false,
      assignedTo: d.assignTo?.id ?? null,
      assignedAt: d.assignTo ? daysAgo(randInt(1, 14)) : null,
      assignmentMode: AssignmentMode.standard,
      teamId: d.team?.id ?? null,
      type: camp ? LeadType.campaign : LeadType.primary,
      propertyPreferences: { bedrooms: randInt(1, 4), budget: randInt(1, 5) * 500000 },
      createdAt: daysAgo(randInt(1, 60)),
    }});
    createdLeads.push(lead);

    // Lead assignment record
    if (d.assignTo) {
      await prisma.leadAssignment.create({ data: {
        leadId: lead.id,
        assignedTo: d.assignTo.id,
        assignedBy: ops.id,
        assignmentType: 'manual',
        assignedAt: daysAgo(randInt(1, 14)),
      }});
    }
  }
  console.log(`✅  Leads (${createdLeads.length})`);

  // ── 8. LEAD FEEDBACK ──────────────────────────────────────────────────────
  const feedbackStatuses: LeadStatus[] = [
    LeadStatus.follow_up, LeadStatus.interested, LeadStatus.no_answer,
    LeadStatus.qualified, LeadStatus.contacted, LeadStatus.not_interested,
  ];
  const feedbackTexts = [
    'العميل مهتم جداً بالوحدات في القاهرة الجديدة، طلب عرض سعر مفصل.',
    'لم يرد على المكالمة، سأحاول مرة أخرى غداً.',
    'العميل يريد زيارة الموقع قبل اتخاذ القرار.',
    'تحدثت مع العميل لمدة 15 دقيقة، مهتم بشقة 3 غرف.',
    'العميل غير مهتم حالياً، سيتواصل لاحقاً.',
    'وافق العميل على موعد معاينة الأسبوع القادم.',
    'العميل يقارن بين عدة مشاريع، يحتاج وقتاً للحسم.',
    'تم إرسال الكتالوج والأسعار على واتساب.',
  ];

  for (let i = 0; i < 20; i++) {
    const lead = createdLeads[i % createdLeads.length];
    const salesUser = salesUsers[i % salesUsers.length];
    const fb = await prisma.leadFeedback.create({ data: {
      leadId: lead.id,
      userId: salesUser.id,
      feedbackType: feedbackStatuses[i % feedbackStatuses.length],
      description: feedbackTexts[i % feedbackTexts.length],
      nextAction: i % 3 === 0 ? 'مكالمة متابعة' : i % 3 === 1 ? 'إرسال عرض سعر' : 'جدولة معاينة',
      nextActionDate: daysFromNow(randInt(1, 7)),
      callDuration: randInt(60, 900),
      createdAt: daysAgo(randInt(0, 10)),
    }});

    // Call log tied to feedback
    await prisma.callLog.create({ data: {
      leadId: lead.id,
      userId: salesUser.id,
      callType: CallType.outbound,
      callStatus: i % 4 === 0 ? CallStatus.no_answer : CallStatus.completed,
      duration: randInt(30, 600),
      initiatedFrom: Platform.web,
      feedbackId: fb.id,
      createdAt: daysAgo(randInt(0, 10)),
    }});
  }
  console.log('✅  Lead Feedback + Call Logs (20 each)');

  // ── 9. MEETINGS ───────────────────────────────────────────────────────────
  const meetingDefs = [
    { lead: 0,  salesUser: s1, type: MeetingType.site_visit, status: MeetingStatus.completed,   dAgo: 10 },
    { lead: 1,  salesUser: s1, type: MeetingType.office,     status: MeetingStatus.completed,   dAgo: 7  },
    { lead: 2,  salesUser: s2, type: MeetingType.site_visit, status: MeetingStatus.completed,   dAgo: 5  },
    { lead: 4,  salesUser: s3, type: MeetingType.virtual,    status: MeetingStatus.completed,   dAgo: 3  },
    { lead: 7,  salesUser: s4, type: MeetingType.site_visit, status: MeetingStatus.scheduled,   dAgo: -2 },
    { lead: 8,  salesUser: s5, type: MeetingType.office,     status: MeetingStatus.scheduled,   dAgo: -3 },
    { lead: 9,  salesUser: s5, type: MeetingType.site_visit, status: MeetingStatus.scheduled,   dAgo: -5 },
    { lead: 6,  salesUser: s4, type: MeetingType.office,     status: MeetingStatus.cancelled,   dAgo: 4  },
    { lead: 12, salesUser: s1, type: MeetingType.site_visit, status: MeetingStatus.completed,   dAgo: 20 },
    { lead: 13, salesUser: s2, type: MeetingType.office,     status: MeetingStatus.completed,   dAgo: 15 },
  ];

  for (const m of meetingDefs) {
    const isCompleted = m.status === MeetingStatus.completed;
    await prisma.meeting.create({ data: {
      leadId: createdLeads[m.lead].id,
      scheduledBy: m.salesUser.id,
      meetingDate: daysAgo(m.dAgo),
      meetingType: m.type,
      status: m.status,
      location: m.type === MeetingType.site_visit ? 'القاهرة الجديدة، التجمع الخامس' : 'مكتب الشركة، المهندسين',
      notes: 'العميل مهتم بوحدات ذات إطلالة مميزة',
      startedAt: isCompleted ? daysAgo(m.dAgo) : null,
      endedAt: isCompleted ? new Date(daysAgo(m.dAgo).getTime() + 90 * 60000) : null,
      feedback: isCompleted ? 'اجتماع ناجح، العميل في مرحلة اتخاذ القرار.' : null,
      currentLocation: isCompleted ? '30.0444,31.2357' : null,
    }});
  }
  console.log('✅  Meetings (10)');

  // ── 10. UNITS ─────────────────────────────────────────────────────────────
  const unitDefs = [
    { code: 'NC-001', project: 'ماونتن فيو أكتوبر',    location: 'أكتوبر الجديدة',   type: 'شقة',   rooms: 3, baths: 2, area: 145, price: 3200000, install: 22000, floor: 4,  status: UnitStatus.available,  published: true },
    { code: 'NC-002', project: 'ماونتن فيو أكتوبر',    location: 'أكتوبر الجديدة',   type: 'شقة',   rooms: 2, baths: 1, area: 110, price: 2500000, install: 17000, floor: 2,  status: UnitStatus.available,  published: true },
    { code: 'NC-003', project: 'بيفرلي هيلز',           location: 'الشيخ زايد',       type: 'فيلا',  rooms: 5, baths: 4, area: 380, price: 9500000, install: 65000, floor: 0,  status: UnitStatus.reserved,   published: true },
    { code: 'NC-004', project: 'سوديك إيست',            location: 'القاهرة الجديدة',  type: 'شقة',   rooms: 3, baths: 2, area: 160, price: 4200000, install: 29000, floor: 6,  status: UnitStatus.available,  published: true },
    { code: 'NC-005', project: 'سوديك إيست',            location: 'القاهرة الجديدة',  type: 'دوبلكس',rooms: 4, baths: 3, area: 230, price: 5800000, install: 40000, floor: 7,  status: UnitStatus.available,  published: true },
    { code: 'NC-006', project: 'الرحاب 2',              location: 'القاهرة الجديدة',  type: 'شقة',   rooms: 2, baths: 1, area: 95,  price: 1800000, install: 12000, floor: 3,  status: UnitStatus.sold,       published: false },
    { code: 'NC-007', project: 'بالم هيلز المقطم',      location: 'المقطم',           type: 'شقة',   rooms: 3, baths: 2, area: 155, price: 3500000, install: 24000, floor: 5,  status: UnitStatus.available,  published: true },
    { code: 'NC-008', project: 'ماديسون',               location: 'أكتوبر',           type: 'شقة',   rooms: 3, baths: 2, area: 140, price: 2900000, install: 20000, floor: 1,  status: UnitStatus.available,  published: false },
  ];

  const createdUnits: any[] = [];
  for (const u of unitDefs) {
    const unit = await prisma.unit.create({ data: {
      code: u.code,
      description: `وحدة سكنية ${u.type} بمشروع ${u.project}، ${u.rooms} غرف نوم، مساحة ${u.area} م²، إطلالة مميزة وتشطيب سوبر لوكس.`,
      projectName: u.project,
      location: u.location,
      address: `${u.project}، ${u.location}`,
      floor: u.floor,
      price: u.price,
      monthlyInstallment: u.install,
      deliveryDate: daysFromNow(randInt(180, 720)),
      bedrooms: u.rooms,
      bathrooms: u.baths,
      area: u.area,
      unitType: u.type,
      amenities: ['حمام سباحة', 'نادي رياضي', 'حراسة أمنية', 'مولد كهرباء'],
      status: u.status,
      isPublished: u.published,
      publishedAt: u.published ? daysAgo(randInt(1, 30)) : null,
      publishedById: u.published ? admin.id : null,
      createdBy: ops.id,
    }});
    createdUnits.push(unit);
  }
  console.log('✅  Units (8)');

  // ── 11. RESALE UNITS ──────────────────────────────────────────────────────
  await prisma.resaleUnit.create({ data: {
    code: 'RS-001',
    description: 'شقة مستعملة للبيع بحالة ممتازة، تشطيب كامل، مفروشة جزئياً.',
    ownerName: 'محمد السيد',
    ownerPhone: '01098765432',
    location: 'مدينة نصر، شارع مكرم عبيد',
    askingPrice: 2200000,
    bedrooms: 3, bathrooms: 2, area: 135,
    unitType: 'شقة',
    amenities: ['أسانسير', 'بواب'],
    status: ResaleUnitStatus.available,
    createdBy: s1.id,
  }});
  await prisma.resaleUnit.create({ data: {
    code: 'RS-002',
    description: 'فيلا للبيع في كمبوند متميز، حديقة خاصة، مسبح.',
    ownerName: 'كريم فاروق',
    ownerPhone: '01087654321',
    location: 'الشيخ زايد، كمبوند هايد بارك',
    askingPrice: 8500000,
    bedrooms: 5, bathrooms: 4, area: 350,
    unitType: 'فيلا',
    amenities: ['مسبح خاص', 'حديقة', 'جراج'],
    status: ResaleUnitStatus.available,
    createdBy: s2.id,
  }});
  console.log('✅  Resale Units (2)');

  // ── 12. UNIT PREVIEWS ─────────────────────────────────────────────────────
  const previewDefs = [
    { unit: 0, by: s1, client: 'يوسف إبراهيم', phone: '01011111111', dAgo: -2, status: UnitPreviewStatus.scheduled },
    { unit: 1, by: s2, client: 'طارق منصور',   phone: '01033333333', dAgo: 3,  status: UnitPreviewStatus.checked_out },
    { unit: 3, by: s3, client: 'عادل رضا',     phone: '01055555555', dAgo: -5, status: UnitPreviewStatus.scheduled },
    { unit: 4, by: s4, client: 'إيمان جابر',   phone: '01088888888', dAgo: 1,  status: UnitPreviewStatus.checked_in  },
  ];
  for (const p of previewDefs) {
    const isOut = p.status === UnitPreviewStatus.checked_out;
    const isIn  = p.status === UnitPreviewStatus.checked_in || isOut;
    await prisma.unitPreview.create({ data: {
      unitId: createdUnits[p.unit].id,
      requestedById: p.by.id,
      clientName: p.client,
      clientPhone: p.phone,
      scheduledAt: daysAgo(p.dAgo),
      durationMin: 60,
      status: p.status,
      checkInAt: isIn ? new Date(daysAgo(p.dAgo).getTime() + 5 * 60000) : null,
      checkInLat: isIn ? 30.0444 : null,
      checkInLng: isIn ? 31.2357 : null,
      checkOutAt: isOut ? new Date(daysAgo(p.dAgo).getTime() + 65 * 60000) : null,
      checkOutLat: isOut ? 30.0444 : null,
      checkOutLng: isOut ? 31.2357 : null,
    }});
  }
  console.log('✅  Unit Previews (4)');

  // ── 13. HR POLICIES ───────────────────────────────────────────────────────
  await prisma.hrPolicy.create({ data: {
    name: 'سياسة الدوام الرسمي',
    shiftStartTime: '09:00',
    shiftEndTime: '17:00',
    graceMinutes: 15,
    penaltyPerHour: 50,
    isActive: true,
  }});
  console.log('✅  HR Policy');

  // ── 14. ATTENDANCE LOGS ───────────────────────────────────────────────────
  const allSales = [s1, s2, s3, s4, s5, s6];
  for (const user of allSales) {
    for (let d = 1; d <= 10; d++) {
      const isLate = d % 4 === 0;
      const checkIn = new Date(daysAgo(d));
      checkIn.setHours(isLate ? 9 : 8, isLate ? randInt(20, 50) : randInt(45, 59), 0);
      const checkOut = new Date(checkIn.getTime() + 8 * 3600000 + randInt(0, 30) * 60000);
      const lateMin = isLate ? checkIn.getMinutes() - 15 : 0;
      await prisma.attendanceLog.create({ data: {
        userId: user.id,
        checkInTime: checkIn,
        checkOutTime: checkOut,
        isLate,
        lateMinutes: isLate ? lateMin : null,
        workDuration: Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000),
        penaltyAmount: isLate ? (lateMin / 60) * 50 : null,
        checkInLocation: '30.0444,31.2357',
        checkOutLocation: '30.0444,31.2357',
      }});
    }
  }
  console.log('✅  Attendance Logs (60)');

  // ── 15. FINANCE ───────────────────────────────────────────────────────────
  // Commissions
  const commDefs = [
    { user: s1, title: 'عمولة بيع وحدة NC-006 - الرحاب 2',  amount: 45000, dAgo: 20 },
    { user: s2, title: 'عمولة بيع شقة مدينة نصر - مباشر',  amount: 38000, dAgo: 15 },
    { user: s1, title: 'عمولة عميل محول - نجوى صالح',       amount: 22000, dAgo: 8  },
    { user: s3, title: 'عمولة إغلاق صفقة فيلا الشيخ زايد', amount: 90000, dAgo: 5  },
  ];
  for (const c of commDefs) {
    await prisma.salesCommission.create({ data: {
      userId: c.user.id,
      title: c.title,
      amount: c.amount,
      saleDate: daysAgo(c.dAgo),
      status: c.dAgo > 10 ? 'collected' : 'pending_collection',
      collectedAt: c.dAgo > 10 ? daysAgo(c.dAgo - 3) : null,
      createdById: admin.id,
    }});
  }

  // Deductions
  await prisma.salesSalaryDeduction.create({ data: {
    userId: s4.id,
    amount: 200,
    reason: 'خصم تأخير متكرر - أسبوع أبريل',
    createdById: admin.id,
  }});
  await prisma.salesSalaryDeduction.create({ data: {
    userId: s6.id,
    amount: 150,
    reason: 'خصم غياب بدون إذن',
    createdById: admin.id,
  }});
  console.log('✅  Finance — Commissions (4) + Deductions (2)');

  // ── 16. NOTIFICATIONS ────────────────────────────────────────────────────
  const notifDefs = [
    { user: s1, type: 'lead_assigned',   title: 'ليد جديد معين لك',         message: 'تم تعيين ليد "يوسف إبراهيم" لك.' },
    { user: s2, type: 'lead_assigned',   title: 'ليد جديد معين لك',         message: 'تم تعيين ليد "طارق منصور" لك.' },
    { user: s1, type: 'meeting_reminder',title: 'تذكير: موعد معاينة',        message: 'لديك معاينة غداً في التجمع الخامس.' },
    { user: s3, type: 'unit_published',  title: 'وحدة جديدة منشورة',        message: 'تم نشر وحدة NC-007 بالم هيلز المقطم.' },
    { user: ops,type: 'lead_retracted',  title: 'تم سحب ليد',               message: 'تم سحب الليد من السيلز بعد انتهاء المهلة.' },
    { user: s4, type: 'preview_approved',title: 'تمت الموافقة على المعاينة', message: 'تمت الموافقة على طلب معاينة وحدة NC-004.' },
  ];
  for (const n of notifDefs) {
    await prisma.notification.create({ data: {
      userId: n.user.id,
      notificationType: n.type as any,
      title: n.title,
      message: n.message,
      isRead: Math.random() > 0.5,
    }});
  }
  console.log('✅  Notifications (6)');

  // ── 17. LEAD ROTATION RULES ──────────────────────────────────────────────
  await prisma.leadRotationRule.create({ data: {
    ruleName: 'قاعدة دوران فريق النيل',
    teamId: team1.id,
    timeLimitHours: 48,
    maxNoAnswerAttempts: 3,
    noAnswerDaysThreshold: 7,
    isActive: true,
  }});
  await prisma.leadRotationRule.create({ data: {
    ruleName: 'قاعدة دوران فريق الهرم',
    teamId: team2.id,
    timeLimitHours: 72,
    maxNoAnswerAttempts: 4,
    noAnswerDaysThreshold: 10,
    isActive: true,
  }});
  console.log('✅  Lead Rotation Rules (2)');

  console.log('\n🎉  Demo seed completed!');
  console.log('─────────────────────────────────────');
  console.log('Login accounts (password: Demo@123)');
  console.log('  admin@sira.com       → Super Admin');
  console.log('  ops@sira.com         → Operation Manager');
  console.log('  sm1@sira.com         → Sales Manager');
  console.log('  tl1@sira.com         → Team Leader (فريق النيل)');
  console.log('  s1@sira.com          → Sales (نور علي)');
  console.log('  s4@sira.com          → Sales (علي أحمد)');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
