const { Review, School } = require("../models");
const { AUDIT_ACTIONS } = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");

function publicReview(row, schoolName) {
  return {
    rating: row.rating,
    reviewMessage: row.reviewMessage,
    schoolName: schoolName || "",
    createdAt: row.createdAt
  };
}

function assertReviewPayload(payload) {
  const rating = Number(payload.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw AppError.badRequest("Rating must be a whole number from 1 to 5");
  }
  const reviewMessage = String(payload.reviewMessage || "").trim();
  if (!reviewMessage) throw AppError.badRequest("Review message is required");
  return { rating, reviewMessage };
}

async function listPublished() {
  const rows = await Review.find({ published: true, active: true }).sort({ updatedAt: -1 }).limit(50);
  const schools = await School.find({ _id: { $in: rows.map((r) => r.schoolId) } }).select("name");
  const names = new Map(schools.map((s) => [String(s._id), s.name]));
  return rows.map((row) => publicReview(row, names.get(String(row.schoolId)) || ""));
}

async function getMine(schoolId) {
  const row = await Review.findOne({ schoolId });
  return row
    ? {
        _id: row._id,
        rating: row.rating,
        reviewMessage: row.reviewMessage,
        published: row.published !== false,
        updatedAt: row.updatedAt
      }
    : null;
}

async function upsertMine({ schoolId, actorId, payload }) {
  const { rating, reviewMessage } = assertReviewPayload(payload);
  const existing = await Review.findOne({ schoolId });
  if (existing) {
    existing.rating = rating;
    existing.reviewMessage = reviewMessage;
    existing.active = true;
    await existing.save();
    await writeAudit({
      schoolId,
      actorId,
      action: AUDIT_ACTIONS.REVIEW_UPDATED,
      entityType: "Review",
      entityId: existing._id,
      metadata: { rating }
    });
    return getMine(schoolId);
  }
  const created = await Review.create({
    schoolId,
    rating,
    reviewMessage,
    published: true,
    active: true
  });
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.REVIEW_CREATED,
    entityType: "Review",
    entityId: created._id,
    metadata: { rating }
  });
  return getMine(schoolId);
}

async function deleteMine({ schoolId, actorId }) {
  const existing = await Review.findOne({ schoolId });
  if (!existing) throw AppError.notFound("Review not found");
  await Review.deleteOne({ _id: existing._id, schoolId });
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.REVIEW_DELETED,
    entityType: "Review",
    entityId: existing._id,
    metadata: {}
  });
  return { deleted: true };
}

async function listAllForAdmin() {
  const rows = await Review.find({}).sort({ updatedAt: -1 }).limit(200);
  const schools = await School.find({ _id: { $in: rows.map((r) => r.schoolId) } }).select("name");
  const names = new Map(schools.map((s) => [String(s._id), s.name]));
  return rows.map((row) => ({
    _id: row._id,
    schoolName: names.get(String(row.schoolId)) || "School",
    rating: row.rating,
    reviewMessage: row.reviewMessage,
    published: row.published !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

async function setPublished({ reviewId, published, actorId }) {
  const row = await Review.findById(reviewId);
  if (!row) throw AppError.notFound("Review not found");
  row.published = Boolean(published);
  await row.save();
  await writeAudit({
    schoolId: row.schoolId,
    actorId,
    action: published ? AUDIT_ACTIONS.REVIEW_UPDATED : AUDIT_ACTIONS.REVIEW_UPDATED,
    entityType: "Review",
    entityId: row._id,
    metadata: { published: row.published, admin: true }
  });
  return {
    _id: row._id,
    schoolName: (await School.findById(row.schoolId).select("name"))?.name || "School",
    rating: row.rating,
    reviewMessage: row.reviewMessage,
    published: row.published !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

module.exports = { listPublished, getMine, upsertMine, deleteMine, listAllForAdmin, setPublished };
