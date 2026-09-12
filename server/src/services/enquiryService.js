const { Enquiry } = require("../models");
const { ENQUIRY_STATUS, AUDIT_ACTIONS } = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimStr(value, max) {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

function parseTeacherCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw AppError.badRequest("Number of teachers must be a whole number");
  }
  return n;
}

async function createEnquiry(payload) {
  if (payload && payload.companyWebsite) {
    return { ignored: true };
  }

  const email = trimStr(payload && payload.email, 254).toLowerCase();
  const schoolName = trimStr(payload && payload.schoolName, 200);
  const contactPerson = trimStr(payload && payload.contactPerson, 160);
  const phone = trimStr(payload && payload.phone, 40);
  const message = trimStr(payload && payload.message, 4000);

  if (!email || !EMAIL_RE.test(email)) {
    throw AppError.badRequest("A valid email is required so we can reply");
  }

  if (!schoolName && !contactPerson && !message && !phone) {
    throw AppError.badRequest("Please add a school name, phone, or a short message");
  }

  const enquiry = await Enquiry.create({
    schoolName,
    contactPerson,
    email,
    phone,
    numberOfTeachers: parseTeacherCount(payload && payload.numberOfTeachers),
    message,
    status: ENQUIRY_STATUS.NEW,
    source: "website"
  });

  await writeAudit({
    schoolId: null,
    actorId: null,
    action: AUDIT_ACTIONS.ENQUIRY_RECEIVED,
    entityType: "Enquiry",
    entityId: enquiry._id,
    metadata: { email }
  });

  return {
    ignored: false,
    enquiry: {
      id: enquiry._id,
      createdAt: enquiry.createdAt
    }
  };
}

async function listEnquiries() {
  return Enquiry.find({}).sort({ createdAt: -1 }).limit(200);
}

async function updateEnquiryStatus(enquiryId, status) {
  const allowed = [ENQUIRY_STATUS.NEW, ENQUIRY_STATUS.CONTACTED, ENQUIRY_STATUS.CLOSED, ENQUIRY_STATUS.REVIEWED];
  if (!allowed.includes(status)) {
    throw AppError.badRequest("Invalid enquiry status");
  }
  const enquiry = await Enquiry.findByIdAndUpdate(
    enquiryId,
    { status: status === ENQUIRY_STATUS.REVIEWED ? ENQUIRY_STATUS.CONTACTED : status },
    { returnDocument: "after", runValidators: true }
  );
  if (!enquiry) throw AppError.notFound("Enquiry not found");
  return enquiry;
}

module.exports = { createEnquiry, listEnquiries, updateEnquiryStatus };
