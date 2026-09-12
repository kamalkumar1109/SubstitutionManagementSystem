const asyncHandler = require("../utils/asyncHandler");
const enquiryService = require("../services/enquiryService");

const create = asyncHandler(async (req, res) => {
  await enquiryService.createEnquiry(req.body);
  res.status(201).json({
    ok: true,
    message: "Thank you. We have received your enquiry and will be in touch."
  });
});

const list = asyncHandler(async (req, res) => {
  const enquiries = await enquiryService.listEnquiries();
  res.json({ ok: true, enquiries });
});

const updateStatus = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.updateEnquiryStatus(req.params.enquiryId, req.body.status);
  res.json({ ok: true, enquiry });
});

module.exports = { create, list, updateStatus };
