process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_admin_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "admin-test-secret";
process.env.NODE_ENV = "test";
process.env.SUBSCRIPTION_ENFORCEMENT = "false";

const http = require("http");
const { connectDb, disconnectDb } = require("../config/db");
const { createApp } = require("../app");
const { School, User, Teacher, Payment, Enquiry, SchoolSubscription, SubscriptionPlan } = require("../models");
const { hashPassword } = require("../utils/password");
const {
  USER_ROLES,
  PAYMENT_STATUS,
  SUBSCRIPTION_STATUS,
  BILLING_INTERVAL,
  ENQUIRY_STATUS
} = require("../config/constants");

function assert(cond, message) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

function request(server, { method, path, body, token, schoolId }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(schoolId ? { "X-School-Id": String(schoolId) } : {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          let json = {};
          try {
            json = data ? JSON.parse(data) : {};
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  await connectDb();
  await Promise.all([
    School.deleteMany({}),
    User.deleteMany({}),
    Teacher.deleteMany({}),
    Payment.deleteMany({}),
    Enquiry.deleteMany({}),
    SchoolSubscription.deleteMany({}),
    SubscriptionPlan.deleteMany({})
  ]);

  const schoolA = await School.create({
    name: "Alpha School",
    schoolCode: `ALP${Date.now()}`,
    email: "alpha@school.test",
    phone: "111"
  });
  const schoolB = await School.create({
    name: "Beta School",
    schoolCode: `BET${Date.now()}`,
    email: "beta@school.test",
    phone: "222"
  });
  await Teacher.create({ schoolId: schoolA._id, name: "Alpha Teacher" });
  await SchoolSubscription.create({
    schoolId: schoolA._id,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    billingCycle: BILLING_INTERVAL.MONTHLY,
    paymentStatus: PAYMENT_STATUS.SUCCEEDED,
    startDate: new Date(),
    expiryDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
  });
  await Payment.create({
    schoolId: schoolA._id,
    amount: 250,
    currency: "INR",
    status: PAYMENT_STATUS.SUCCEEDED,
    paidAt: new Date(),
    razorpayPaymentId: "pay_admin_1",
    receipt: "rcpt_1"
  });
  await Payment.create({
    schoolId: schoolA._id,
    amount: 10,
    currency: "INR",
    status: PAYMENT_STATUS.FAILED,
    failureReason: "declined"
  });
  const enquiry = await Enquiry.create({
    schoolName: "Riverdale",
    contactPerson: "Priya",
    email: "priya@example.edu",
    phone: "999",
    message: "We would like a demo.",
    status: ENQUIRY_STATUS.NEW
  });

  const schoolAdmin = await User.create({
    schoolId: schoolA._id,
    name: "School Admin",
    email: `school-admin-${Date.now()}@school.test`,
    passwordHash: await hashPassword("password123"),
    role: USER_ROLES.SCHOOL_ADMIN
  });
  const owner = await User.create({
    name: "Owner",
    email: `owner-admin-${Date.now()}@sms.test`,
    passwordHash: await hashPassword("password123"),
    role: USER_ROLES.SUPER_ADMIN
  });

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  async function login(email, role) {
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { loginId: email, password: "password123", expectedRole: role }
    });
    assert(res.status === 200, `login ${email}`);
    return res.json.token;
  }

  const schoolToken = await login(schoolAdmin.email, USER_ROLES.SCHOOL_ADMIN);
  const ownerToken = await login(owner.email, USER_ROLES.SUPER_ADMIN);

  for (const path of [
    "/api/admin/overview",
    "/api/admin/schools",
    "/api/admin/subscriptions",
    "/api/admin/payments",
    "/api/admin/enquiries",
    "/api/admin/plans",
    "/api/admin/settings"
  ]) {
    const denied = await request(server, { method: "GET", path, token: schoolToken });
    assert(denied.status === 403, `school admin cannot access ${path}`);
  }

  const overview = await request(server, { method: "GET", path: "/api/admin/overview", token: ownerToken });
  assert(overview.status === 200, "super admin can load the dashboard");
  const m = overview.json.overview.metrics;
  assert(m.totalSchools === 2, "dashboard school count");
  assert(m.activeSchools === 2, "dashboard active schools");
  assert(m.inactiveSchools === 0, "dashboard inactive schools");
  assert(m.totalTeachers === 1, "dashboard teacher count");
  assert(m.activeSubscriptions === 1, "dashboard active subscriptions");
  assert(m.successfulPayments === 1, "dashboard successful payments");
  assert(m.failedPayments === 1, "dashboard failed payments");
  assert(m.pendingPayments === 0, "dashboard pending payments");
  assert(m.totalRevenue === 250, "dashboard total revenue");
  assert(m.monthlyRevenue === 250, "dashboard monthly revenue");
  assert(m.yearlyRevenue === 250, "dashboard yearly revenue");
  assert(m.totalEnquiries === 1, "dashboard enquiry count");
  assert(Array.isArray(overview.json.overview.analytics.schoolsOverTime), "schools-over-time chart uses real series");
  assert(Array.isArray(overview.json.overview.analytics.revenueOverTime), "revenue chart uses real series");

  const list = await request(server, { method: "GET", path: "/api/admin/schools", token: ownerToken });
  assert(list.status === 200 && list.json.schools.length === 2, "school list");
  const alpha = list.json.schools.find((s) => s.name === "Alpha School");
  assert(alpha.status === SUBSCRIPTION_STATUS.ACTIVE, "school list shows subscription status");

  const details = await request(server, {
    method: "GET",
    path: `/api/admin/schools/${schoolA._id}`,
    token: ownerToken
  });
  assert(details.status === 200, "school details load");
  assert(details.json.teachers.total === 1, "details teacher count is for this school only");
  assert(details.json.payments.every((p) => String(p.schoolId) === String(schoolA._id)), "details payments are school-scoped");
  assert(
    !JSON.stringify(details.json).toLowerCase().includes("cvv") &&
      !JSON.stringify(details.json).includes("cardNumber"),
    "details do not expose payment credentials"
  );

  const patched = await request(server, {
    method: "PATCH",
    path: `/api/admin/schools/${schoolA._id}`,
    token: ownerToken,
    body: { name: "Alpha Senior" }
  });
  assert(patched.status === 200 && patched.json.school.name === "Alpha Senior", "school A can be edited");
  const hijack = await request(server, {
    method: "PATCH",
    path: `/api/admin/schools/${schoolA._id}`,
    token: ownerToken,
    body: { name: "Hacked", schoolId: String(schoolB._id) }
  });
  assert(hijack.status === 400, "cannot retarget another school via body");
  const stillBeta = await School.findById(schoolB._id);
  assert(stillBeta.name === "Beta School", "editing school A does not change school B");

  const off = await request(server, {
    method: "POST",
    path: `/api/admin/schools/${schoolA._id}/deactivate`,
    token: ownerToken,
    body: {}
  });
  assert(off.status === 200 && off.json.school.active === false, "school can be deactivated");
  const on = await request(server, {
    method: "POST",
    path: `/api/admin/schools/${schoolA._id}/activate`,
    token: ownerToken,
    body: {}
  });
  assert(on.status === 200 && on.json.school.active === true, "school can be activated");

  const subs = await request(server, {
    method: "GET",
    path: "/api/admin/subscriptions?status=active",
    token: ownerToken
  });
  assert(subs.status === 200, "subscription list loads");
  assert(
    (subs.json.subscriptions || []).every((row) => row.status === SUBSCRIPTION_STATUS.ACTIVE),
    "active filter returns active rows"
  );

  const pays = await request(server, { method: "GET", path: "/api/admin/payments", token: ownerToken });
  assert(pays.status === 200 && pays.json.payments.length >= 2, "payment list loads");
  assert(
    pays.json.payments.some((p) => p.razorpayPaymentId === "pay_admin_1"),
    "razorpay reference is listed"
  );

  const contacted = await request(server, {
    method: "PATCH",
    path: `/api/admin/enquiries/${enquiry._id}`,
    token: ownerToken,
    body: { status: "CONTACTED" }
  });
  assert(contacted.status === 200 && contacted.json.enquiry.status === ENQUIRY_STATUS.CONTACTED, "enquiry can be marked contacted");

  const closedDenied = await request(server, {
    method: "PATCH",
    path: `/api/admin/enquiries/${enquiry._id}`,
    token: schoolToken,
    body: { status: "CLOSED" }
  });
  assert(closedDenied.status === 403, "school admin cannot change enquiries");

  const openReg = await request(server, {
    method: "POST",
    path: "/api/auth/register-school",
    body: { school: { name: "X", schoolCode: "X1", email: "x@x.test" }, admin: { name: "X", email: "x@x.test", password: "password123" } }
  });
  assert(openReg.status === 401, "public cannot register a school");

  const schoolCreateDenied = await request(server, {
    method: "POST",
    path: "/api/admin/schools",
    token: schoolToken,
    body: { name: "Nope", schoolCode: "NOPE", manager: { name: "N", email: "n@n.test", password: "xyz" } }
  });
  assert(schoolCreateDenied.status === 403, "school admin cannot create schools");

  const plan = await SubscriptionPlan.create({
    name: "Starter",
    billingCycle: BILLING_INTERVAL.MONTHLY,
    amount: 9900,
    currency: "INR",
    active: true
  });

  const created = await request(server, {
    method: "POST",
    path: "/api/admin/schools",
    token: ownerToken,
    body: {
      name: "Demo School",
      schoolCode: "DEMO",
      phone: "999",
      address: "1 Demo Road",
      active: true,
      planId: plan._id,
      manager: { name: "Demo Manager", email: "test@demo.com", password: "xyz" }
    }
  });
  assert(created.status === 201, "admin can create a school");
  assert(created.json.school.name === "Demo School", "created school is stored");
  assert(created.json.manager.email === "test@demo.com", "school manager user is stored");
  assert(created.json.manager.role === USER_ROLES.SCHOOL_ADMIN, "manager uses school admin role");
  assert(created.json.subscription.plan === "Starter", "selected plan is attached to the school");
  assert(!created.json.token, "admin create does not sign in as the school manager");

  const listed = await request(server, { method: "GET", path: "/api/admin/schools", token: ownerToken });
  assert(
    (listed.json.schools || []).some((s) => s.schoolCode === "DEMO"),
    "new school appears in the schools table"
  );

  const afterCreate = await request(server, { method: "GET", path: "/api/admin/overview", token: ownerToken });
  assert(afterCreate.json.overview.metrics.totalSchools === 3, "total schools includes the new school");
  assert(afterCreate.json.overview.metrics.activeSchools === 3, "new school counted as active");
  assert(afterCreate.json.overview.metrics.inactiveSchools === 0, "no inactive schools yet");
  assert(afterCreate.json.overview.metrics.successfulPayments === 1, "creating a school does not invent payments");

  const demoLogin = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: "test@demo.com", password: "xyz", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(demoLogin.status === 200, "school manager can sign in with the issued password");
  const demoToken = demoLogin.json.token;

  const demoDash = await request(server, {
    method: "GET",
    path: "/api/schools/current/dashboard",
    token: demoToken
  });
  assert(demoDash.status === 200 && demoDash.json.dashboard.school.name === "Demo School", "manager sees own school");

  const stealDash = await request(server, {
    method: "GET",
    path: "/api/schools/current/dashboard",
    token: schoolToken,
    schoolId: created.json.school._id
  });
  assert(stealDash.status === 403, "another school cannot open the new school");

  const demoAdmin = await request(server, {
    method: "GET",
    path: "/api/admin/overview",
    token: demoToken
  });
  assert(demoAdmin.status === 403, "school manager cannot open the admin dashboard");

  const offDemo = await request(server, {
    method: "POST",
    path: `/api/admin/schools/${created.json.school._id}/deactivate`,
    token: ownerToken,
    body: {}
  });
  assert(offDemo.status === 200 && offDemo.json.school.active === false, "demo school deactivated");

  const afterOff = await request(server, { method: "GET", path: "/api/admin/overview", token: ownerToken });
  assert(afterOff.json.overview.metrics.totalSchools === 3, "deactivation keeps the school in totals");
  assert(afterOff.json.overview.metrics.activeSchools === 2, "deactivated school is not active");
  assert(afterOff.json.overview.metrics.inactiveSchools === 1, "deactivated school is inactive");

  const blockedLogin = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: "test@demo.com", password: "xyz", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(blockedLogin.status === 403, "inactive school cannot log in");
  assert(
    blockedLogin.json.error ===
      "Your school account has been deactivated. Please contact the platform administrator.",
    "deactivated login shows the platform message"
  );

  const blockedApi = await request(server, {
    method: "GET",
    path: "/api/schools/current/dashboard",
    token: demoToken
  });
  assert(blockedApi.status === 403, "inactive school token cannot call school APIs");

  const stillDemo = await School.findById(created.json.school._id);
  const stillManager = await User.findOne({ email: "test@demo.com" });
  assert(stillDemo && stillManager, "deactivation preserves school and manager records");

  const onDemo = await request(server, {
    method: "POST",
    path: `/api/admin/schools/${created.json.school._id}/activate`,
    token: ownerToken,
    body: {}
  });
  assert(onDemo.status === 200 && onDemo.json.school.active === true, "demo school activated");

  const afterOn = await request(server, { method: "GET", path: "/api/admin/overview", token: ownerToken });
  assert(afterOn.json.overview.metrics.activeSchools === 3, "reactivated school counts as active");
  assert(afterOn.json.overview.metrics.inactiveSchools === 0, "no inactive schools after restore");

  const restoredLogin = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: "test@demo.com", password: "xyz", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(restoredLogin.status === 200, "school manager can log in after reactivation");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[admin] all checks passed");
}

run().catch(async (err) => {
  console.error("[admin] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
