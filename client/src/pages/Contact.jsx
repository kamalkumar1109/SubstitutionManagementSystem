import React, { useState } from "react";
import { submitEnquiry } from "../utils/publicApi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const empty = {
  schoolName: "",
  contactPerson: "",
  email: "",
  phone: "",
  numberOfTeachers: "",
  message: "",
  companyWebsite: ""
};

export default function Contact() {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [fail, setFail] = useState("");

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    const next = {};
    const email = form.email.trim();
    if (!email) next.email = "Email is required so we can reply.";
    else if (!EMAIL_RE.test(email)) next.email = "Enter a valid email address.";

    const hasContext =
      form.schoolName.trim() || form.contactPerson.trim() || form.phone.trim() || form.message.trim();
    if (!hasContext) {
      next.message = "Add a school name, phone, or a short note about what you need.";
    }

    if (form.numberOfTeachers !== "") {
      const n = Number(form.numberOfTeachers);
      if (!Number.isInteger(n) || n < 0) {
        next.numberOfTeachers = "Use a whole number, or leave this blank.";
      }
    }

    if (form.phone.trim() && form.phone.trim().length < 7) {
      next.phone = "Enter a full phone number, or leave this blank.";
    }

    return next;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSuccess("");
    setFail("");
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;

    try {
      setBusy(true);
      const data = await submitEnquiry({
        schoolName: form.schoolName.trim(),
        contactPerson: form.contactPerson.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        numberOfTeachers: form.numberOfTeachers === "" ? null : Number(form.numberOfTeachers),
        message: form.message.trim(),
        companyWebsite: form.companyWebsite
      });
      setSuccess(data.message || "Thank you. We have received your enquiry.");
      setForm(empty);
      setErrors({});
    } catch (err) {
      setFail(err.message || "We could not send the enquiry. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="site-page">
      <div className="site-page-intro">
        <p className="site-eyebrow">Enquiries</p>
        <h1>Interested in using SMS for your school?</h1>
        <p className="site-lead">
          Tell us a little about the school. Only an email is required. We use this form to store
          enquiries — it does not create a login, and you should never enter a password here.
        </p>
      </div>

      <form className="site-form site-form-wide" onSubmit={onSubmit} noValidate>
        <div className="site-hp" aria-hidden="true">
          <label htmlFor="companyWebsite">Company website</label>
          <input
            id="companyWebsite"
            name="companyWebsite"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={form.companyWebsite}
            onChange={(e) => setField("companyWebsite", e.target.value)}
          />
        </div>

        <div className="site-form-grid">
          <div className="site-form-field">
            <label htmlFor="schoolName">School name</label>
            <input
              id="schoolName"
              name="schoolName"
              value={form.schoolName}
              onChange={(e) => setField("schoolName", e.target.value)}
            />
          </div>
          <div className="site-form-field">
            <label htmlFor="contactPerson">Contact person</label>
            <input
              id="contactPerson"
              name="contactPerson"
              value={form.contactPerson}
              onChange={(e) => setField("contactPerson", e.target.value)}
            />
          </div>
          <div className="site-form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
            />
            {errors.email ? <span className="site-field-error">{errors.email}</span> : null}
          </div>
          <div className="site-form-field">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
            />
            {errors.phone ? <span className="site-field-error">{errors.phone}</span> : null}
          </div>
          <div className="site-form-field">
            <label htmlFor="numberOfTeachers">Number of teachers (optional)</label>
            <input
              id="numberOfTeachers"
              name="numberOfTeachers"
              inputMode="numeric"
              value={form.numberOfTeachers}
              onChange={(e) => setField("numberOfTeachers", e.target.value)}
            />
            {errors.numberOfTeachers ? (
              <span className="site-field-error">{errors.numberOfTeachers}</span>
            ) : null}
          </div>
        </div>
        <div className="site-form-field">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            name="message"
            rows={5}
            value={form.message}
            onChange={(e) => setField("message", e.target.value)}
            placeholder="Class groups, number of sections, or when you would like to start."
          />
          {errors.message ? <span className="site-field-error">{errors.message}</span> : null}
        </div>

        {fail ? (
          <p className="site-alert site-alert-error" role="alert">
            {fail}
          </p>
        ) : null}
        {success ? (
          <p className="site-alert site-alert-ok" role="status">
            {success}
          </p>
        ) : null}

        <button className="site-btn site-btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Submit Enquiry"}
        </button>
      </form>
    </section>
  );
}
