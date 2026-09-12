const {
  School,
  SchoolSubscription,
  Teacher,
  Payment,
  Enquiry,
  AcademicSession,
  Substitution,
  SubstitutionRun,
  User,
  Timetable
} = require("../models");
const {
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  BILLING_INTERVAL,
  AUDIT_ACTIONS,
  USER_ROLES
} = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");
const { refreshExpiredSubscriptions, presentPlan, provisionSchoolPlan } = require("./subscriptionService");
const { env } = require("../config/env");
const razorpay = require("./razorpayGateway");
const { hashPassword } = require("../utils/password");
const { toPublicUser } = require("./authService");
const academicSessionService = require("./academicSessionService");

function monthKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastTwelveMonthKeys(now = new Date()) {
  const keys = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (let i = 11; i >= 0; i -= 1) {
    const dt = new Date(Date.UTC(y, m - i, 1));
    keys.push(monthKey(dt));
  }
  return keys;
}

function startOfUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfUtcYear(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

function presentAdminSubscription(school, sub) {
  const plan = sub?.planId && sub.planId.name ? presentPlan(sub.planId) : null;
  return {
    _id: sub?._id || null,
    schoolId: school._id,
    schoolName: school.name,
    schoolCode: school.schoolCode,
    schoolActive: school.active,
    plan: plan ? plan.name : "—",
    planId: plan?._id || sub?.planId || null,
    billingCycle: sub?.billingCycle || plan?.billingCycle || school.subscription?.billingInterval || null,
    status: sub?.status || school.subscription?.status || SUBSCRIPTION_STATUS.NONE,
    startDate: sub?.startDate || school.subscription?.currentPeriodStart || null,
    expiryDate: sub?.expiryDate || school.subscription?.currentPeriodEnd || null,
    paymentStatus: sub?.paymentStatus || null,
    createdAt: school.createdAt
  };
}

function presentAdminPayment(payment) {
  return {
    _id: payment._id,
    school: payment.schoolId?.name || "—",
    schoolId: payment.schoolId?._id || payment.schoolId,
    schoolCode: payment.schoolId?.schoolCode || "",
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    razorpayOrderId: payment.razorpayOrderId || "",
    razorpayPaymentId: payment.razorpayPaymentId || payment.providerPaymentId || "",
    receipt: payment.receipt || "",
    subscriptionStatus: payment.subscriptionId?.status || "",
    planName: payment.planId?.name || "",
    billingCycle: payment.billedForInterval || payment.planId?.billingCycle || ""
  };
}

async function listAdminSchools() {
  await refreshExpiredSubscriptions();
  const schools = await School.find({}).sort({ name: 1 });
  if (!schools.length) return [];
  const ids = schools.map((s) => s._id);
  const [subs, teacherGroups] = await Promise.all([
    SchoolSubscription.find({ schoolId: { $in: ids } }).populate("planId", "name billingCycle interval"),
    Teacher.aggregate([{ $match: { schoolId: { $in: ids } } }, { $group: { _id: "$schoolId", n: { $sum: 1 } } }])
  ]);
  const subBySchool = new Map(subs.map((s) => [String(s.schoolId), s]));
  const teachersBySchool = new Map(teacherGroups.map((g) => [String(g._id), g.n]));
  return schools.map((school) => {
    const row = presentAdminSubscription(school, subBySchool.get(String(school._id)));
    return {
      ...row,
      name: school.name,
      email: school.email,
      phone: school.phone || "",
      address: school.address || "",
      timezone: school.timezone,
      contact: school.email,
      active: school.active,
      teacherCount: teachersBySchool.get(String(school._id)) || 0,
      createdAt: school.createdAt
    };
  });
}

function indiaAcademicYear() {
  const now = new Date();
  const month = now.getMonth();
  const startYear = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `${startYear}-${String(startYear + 1).slice(-2)}`,
    startDate: new Date(`${startYear}-04-01`),
    endDate: new Date(`${startYear + 1}-03-31`)
  };
}

async function createAdminSchool(payload, actorId) {
  const schoolIn = payload.school || payload;
  const manager = payload.manager || payload.admin || {};
  if (!schoolIn.name || !schoolIn.schoolCode) {
    throw AppError.badRequest("School name and school code are required");
  }
  if (!manager.name || !manager.email || !manager.password) {
    throw AppError.badRequest("School manager name, email, and password are required");
  }

  const schoolCode = String(schoolIn.schoolCode).trim().toUpperCase();
  const managerEmail = String(manager.email).trim().toLowerCase();
  const schoolEmail = String(schoolIn.email || managerEmail).trim().toLowerCase();

  const existingCode = await School.findOne({ schoolCode });
  if (existingCode) throw AppError.conflict("schoolCode already exists");
  const existingEmail = await User.findOne({ email: managerEmail });
  if (existingEmail) throw AppError.conflict("School manager email already exists");

  let passwordHash;
  try {
    passwordHash = await hashPassword(manager.password);
  } catch (err) {
    throw AppError.badRequest(err.message);
  }

  const active = schoolIn.active === false || schoolIn.status === "INACTIVE" ? false : true;

  let school;
  let user;
  try {
    school = await School.create({
      name: String(schoolIn.name).trim(),
      schoolCode,
      email: schoolEmail,
      phone: schoolIn.phone || "",
      address: schoolIn.address || "",
      timezone: schoolIn.timezone || "Asia/Kolkata",
      active
    });

    user = await User.create({
      schoolId: school._id,
      name: String(manager.name).trim(),
      email: managerEmail,
      passwordHash,
      role: USER_ROLES.SCHOOL_ADMIN,
      active: true
    });

    const year = indiaAcademicYear();
    await academicSessionService.createSession({
      schoolId: school._id,
      actorId: actorId || user._id,
      name: year.name,
      startDate: year.startDate,
      endDate: year.endDate,
      setCurrent: true,
      createTimetable: true
    });

    await provisionSchoolPlan({
      schoolId: school._id,
      planId: schoolIn.planId || payload.planId || null,
      actorId: actorId || user._id
    });

    await writeAudit({
      schoolId: school._id,
      actorId: actorId || user._id,
      action: AUDIT_ACTIONS.SCHOOL_CREATED,
      entityType: "School",
      entityId: school._id,
      metadata: { managerEmail }
    });
    await writeAudit({
      schoolId: school._id,
      actorId: actorId || user._id,
      action: AUDIT_ACTIONS.USER_CREATED,
      entityType: "User",
      entityId: user._id
    });
  } catch (err) {
    if (school?._id) {
      const id = school._id;
      await User.deleteMany({ schoolId: id });
      await AcademicSession.deleteMany({ schoolId: id });
      await Timetable.deleteMany({ schoolId: id });
      await SchoolSubscription.deleteMany({ schoolId: id });
      await School.deleteOne({ _id: id });
    }
    throw err;
  }

  const details = await getAdminSchool(school._id);
  return {
    ...details,
    manager: toPublicUser(user)
  };
}

async function getAdminSchool(schoolId) {
  await refreshExpiredSubscriptions();
  const school = await School.findById(schoolId).populate("currentAcademicSession");
  if (!school) throw AppError.notFound("School not found");

  const [sub, teacherCount, payments, recentSubstitutions, recentRuns, admins] = await Promise.all([
    SchoolSubscription.findOne({ schoolId }).populate("planId"),
    Teacher.countDocuments({ schoolId }),
    Payment.find({ schoolId }).sort({ createdAt: -1 }).limit(50).populate("planId", "name billingCycle"),
    Substitution.find({ schoolId })
      .sort({ updatedAt: -1 })
      .limit(12)
      .populate("absentTeacherId", "name")
      .populate("substituteTeacherId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name"),
    SubstitutionRun.find({ schoolId }).sort({ generatedAt: -1 }).limit(8).select("dateKey status summary generatedAt"),
    User.find({ schoolId, role: "SCHOOL_ADMIN" }).select("name email active")
  ]);

  const session = school.currentAcademicSession;
  return {
    school: {
      _id: school._id,
      name: school.name,
      schoolCode: school.schoolCode,
      email: school.email,
      phone: school.phone || "",
      address: school.address || "",
      timezone: school.timezone,
      active: school.active,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt
    },
    accountStatus: school.active ? "Active" : "Inactive",
    subscription: presentAdminSubscription(school, sub),
    teachers: { total: teacherCount },
    academicSession: session
      ? {
          _id: session._id,
          name: session.name,
          status: session.status,
          isCurrent: session.isCurrent,
          startDate: session.startDate,
          endDate: session.endDate
        }
      : null,
    payments: payments.map(presentAdminPayment),
    substitutions: recentSubstitutions.map((row) => ({
      _id: row._id,
      dateKey: row.dateKey,
      period: row.period,
      className: row.classId?.name || "—",
      sectionName: row.sectionId?.name || "—",
      subjectName: row.subjectId?.name || "—",
      absentTeacherName: row.absentTeacherId?.name || "—",
      substituteTeacherName: row.substituteTeacherId?.name || "—",
      status: row.status
    })),
    runs: recentRuns,
    admins
  };
}

async function updateAdminSchool(schoolId, patch, actorId) {
  const school = await School.findById(schoolId);
  if (!school) throw AppError.notFound("School not found");
  if (patch.schoolId && String(patch.schoolId) !== String(schoolId)) {
    throw AppError.badRequest("Cannot change a school’s identity to another school");
  }
  const allowed = ["name", "email", "phone", "address", "timezone", "logo"];
  for (const key of allowed) {
    if (patch[key] !== undefined) school[key] = patch[key];
  }
  await school.save();
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.SCHOOL_UPDATED,
    entityType: "School",
    entityId: school._id,
    metadata: { fields: allowed.filter((k) => patch[k] !== undefined) }
  });
  return getAdminSchool(schoolId);
}

async function setSchoolActive(schoolId, active, actorId) {
  const school = await School.findById(schoolId);
  if (!school) throw AppError.notFound("School not found");
  school.active = Boolean(active);
  await school.save();
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.SCHOOL_UPDATED,
    entityType: "School",
    entityId: school._id,
    metadata: { active: school.active }
  });
  return getAdminSchool(schoolId);
}

async function listAdminSubscriptions(filter) {
  await refreshExpiredSubscriptions();
  const rows = await listAdminSchools();
  const now = Date.now();
  const soon = now + 14 * 24 * 60 * 60 * 1000;
  const needle = String(filter || "all").toLowerCase();
  return rows.filter((row) => {
    if (needle === "all" || !needle) return true;
    if (needle === "active") return row.status === SUBSCRIPTION_STATUS.ACTIVE;
    if (needle === "expired") return row.status === SUBSCRIPTION_STATUS.EXPIRED;
    if (needle === "pending") {
      return row.status === SUBSCRIPTION_STATUS.PENDING || row.paymentStatus === PAYMENT_STATUS.PENDING;
    }
    if (needle === "cancelled" || needle === "canceled") {
      return row.status === SUBSCRIPTION_STATUS.CANCELLED || row.status === SUBSCRIPTION_STATUS.CANCELED;
    }
    if (needle === "expiring" || needle === "expiring-soon") {
      if (row.status !== SUBSCRIPTION_STATUS.ACTIVE || !row.expiryDate) return false;
      const t = new Date(row.expiryDate).getTime();
      return t >= now && t <= soon;
    }
    return true;
  });
}

async function listAdminPayments() {
  const rows = await Payment.find({})
    .sort({ createdAt: -1 })
    .limit(300)
    .populate("schoolId", "name schoolCode")
    .populate("planId", "name billingCycle interval")
    .populate("subscriptionId", "status expiryDate billingCycle");
  return rows.map(presentAdminPayment);
}

async function revenueTotals() {
  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  const yearStart = startOfUtcYear(now);
  const [all, month, year] = await Promise.all([
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.SUCCEEDED } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          status: PAYMENT_STATUS.SUCCEEDED,
          $or: [{ paidAt: { $gte: monthStart } }, { paidAt: null, createdAt: { $gte: monthStart } }]
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          status: PAYMENT_STATUS.SUCCEEDED,
          $or: [{ paidAt: { $gte: yearStart } }, { paidAt: null, createdAt: { $gte: yearStart } }]
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ])
  ]);
  return {
    totalRevenue: all[0]?.total || 0,
    monthlyRevenue: month[0]?.total || 0,
    yearlyRevenue: year[0]?.total || 0
  };
}

async function buildAnalytics() {
  const keys = lastTwelveMonthKeys();
  const [schools, payments, subs] = await Promise.all([
    School.find({}).select("createdAt"),
    Payment.find({ status: PAYMENT_STATUS.SUCCEEDED }).select("amount paidAt createdAt"),
    SchoolSubscription.find({}).select("status billingCycle")
  ]);

  const newByMonth = new Map(keys.map((k) => [k, 0]));
  for (const school of schools) {
    const k = monthKey(school.createdAt);
    if (newByMonth.has(k)) newByMonth.set(k, newByMonth.get(k) + 1);
  }
  let running = schools.filter((s) => monthKey(s.createdAt) < keys[0]).length;
  const schoolsOverTime = keys.map((month) => {
    running += newByMonth.get(month) || 0;
    return { month, newSchools: newByMonth.get(month) || 0, total: running };
  });

  const revenueMap = new Map(keys.map((k) => [k, 0]));
  for (const pay of payments) {
    const k = monthKey(pay.paidAt || pay.createdAt);
    if (revenueMap.has(k)) revenueMap.set(k, revenueMap.get(k) + Number(pay.amount || 0));
  }
  const revenueOverTime = keys.map((month) => ({ month, amount: revenueMap.get(month) || 0 }));

  const statusCounts = {};
  for (const s of Object.values(SUBSCRIPTION_STATUS)) statusCounts[s] = 0;
  for (const sub of subs) {
    const st = sub.status || SUBSCRIPTION_STATUS.NONE;
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  }
  const noneSchools = Math.max(0, schools.length - subs.length);
  statusCounts[SUBSCRIPTION_STATUS.NONE] = (statusCounts[SUBSCRIPTION_STATUS.NONE] || 0) + noneSchools;
  const subscriptionsByStatus = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, count }));

  let monthly = 0;
  let yearly = 0;
  for (const sub of subs) {
    if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) continue;
    if (sub.billingCycle === BILLING_INTERVAL.YEARLY) yearly += 1;
    else if (sub.billingCycle === BILLING_INTERVAL.MONTHLY) monthly += 1;
  }

  return {
    schoolsOverTime,
    revenueOverTime,
    subscriptionsByStatus,
    monthlyVsYearly: [
      { cycle: "MONTHLY", count: monthly },
      { cycle: "YEARLY", count: yearly }
    ]
  };
}

async function getPlatformOverview() {
  const billing = await require("./subscriptionService").billingOverview();
  const revenue = await revenueTotals();
  const analytics = await buildAnalytics();
  const [totalTeachers, totalSchools, activeSchools, totalEnquiries, recentSchools, recentPayments, recentEnquiries] =
    await Promise.all([
      Teacher.countDocuments(),
      School.countDocuments(),
      School.countDocuments({ active: true }),
      Enquiry.countDocuments(),
      listAdminSchools().then((rows) => rows.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)),
      listAdminPayments().then((rows) => rows.slice(0, 8)),
      Enquiry.find({}).sort({ createdAt: -1 }).limit(8)
    ]);

  return {
    metrics: {
      totalSchools,
      activeSchools,
      inactiveSchools: totalSchools - activeSchools,
      totalTeachers,
      activeSubscriptions: billing.activeSubscriptions,
      expiredSubscriptions: billing.expiredSubscriptions,
      subscriptionsExpiringSoon: billing.upcomingRenewals,
      successfulPayments: billing.successfulPayments,
      pendingPayments: billing.pendingPayments,
      failedPayments: billing.failedPayments,
      totalRevenue: revenue.totalRevenue,
      monthlyRevenue: revenue.monthlyRevenue,
      yearlyRevenue: revenue.yearlyRevenue,
      totalEnquiries,
      monthlyActive: billing.monthlyActive,
      yearlyActive: billing.yearlyActive
    },
    analytics,
    recent: {
      schools: recentSchools,
      payments: recentPayments,
      enquiries: recentEnquiries
    }
  };
}

function platformSettings() {
  return {
    enforcementEnabled: String(process.env.SUBSCRIPTION_ENFORCEMENT || "").toLowerCase() === "true",
    razorpayConfigured: razorpay.configured(),
    environment: env.NODE_ENV,
    jwtExpiresIn: env.JWT_EXPIRES_IN
  };
}

module.exports = {
  listAdminSchools,
  getAdminSchool,
  createAdminSchool,
  updateAdminSchool,
  setSchoolActive,
  listAdminSubscriptions,
  listAdminPayments,
  getPlatformOverview,
  platformSettings,
  presentAdminPayment
};
