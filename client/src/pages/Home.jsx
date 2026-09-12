import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchPublicReviews } from "../utils/publicApi";

const benefits = [
  {
    title: "Faster morning planning",
    text: "Record who is absent or on duty, then generate a period-wise list instead of rebuilding the sheet from scratch."
  },
  {
    title: "Less manual matching",
    text: "The generator looks for teachers who are present, free in that period, and eligible for the class group."
  },
  {
    title: "Class-group eligibility",
    text: "A teacher assigned to groups such as 6–8 is only considered for those classes — enforced on the server, not only in the browser."
  },
  {
    title: "Absent and on-duty status",
    text: "Daily status is stored separately from the teacher’s employment record, so history and the master list stay intact."
  },
  {
    title: "Generated substitutions",
    text: "Each run is saved for a school, date, and academic session so you can see what was produced that morning."
  },
  {
    title: "Manual override",
    text: "Coordinators can change an assignment when the generated choice is not the right one for that period."
  },
  {
    title: "Printable sheets",
    text: "The current workspace can download a PDF of the substitution table. School-branded export will follow the same data."
  },
  {
    title: "Central teacher records",
    text: "Add a teacher with a name first; complete designation, subjects, and eligible groups when you have them."
  },
  {
    title: "Multi-school tenancy",
    text: "Each school’s teachers, classes, timetable, substitutions, and billing stay isolated by school."
  },
  {
    title: "Timetable-ready data",
    text: "Timetable and period entries already exist in the database so a full timetable builder can sit on the same model later."
  }
];

const steps = [
  { n: "01", title: "Mark teacher status", text: "Set present, absent, or on duty for the day. Unmarked teachers are treated as present." },
  { n: "02", title: "Generate substitutions", text: "Create a run for the school and date. Free, eligible teachers are proposed for each uncovered period." },
  { n: "03", title: "Review assignments", text: "Check who covers which class, section, period, and subject before the day begins." },
  { n: "04", title: "Override if needed", text: "Replace a generated substitute, or leave a slot unassigned, with a reason kept on the record." },
  { n: "05", title: "Download or print", text: "Export the sheet for notice boards, offices, and staff who need a paper copy." }
];

function starLabel(rating) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function HomeReviews() {
  const [reviews, setReviews] = useState(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchPublicReviews()
      .then((data) => {
        if (alive) setReviews(data.reviews || []);
      })
      .catch(() => {
        if (alive) setReviews([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!reviews || reviews.length === 0) return null;

  const current = reviews[Math.min(index, reviews.length - 1)];
  const showControls = reviews.length > 1;

  return (
    <section className="site-section site-section-alt" id="reviews">
      <div className="site-section-head">
        <p className="site-eyebrow">Reviews</p>
        <h2>What schools say</h2>
      </div>
      <div className="site-reviews">
        <article className="site-review">
          <p className="site-review-stars" aria-label={`${current.rating} out of 5 stars`}>
            {starLabel(current.rating)}
          </p>
          <p className="site-review-message">{current.reviewMessage}</p>
          {current.schoolName ? <p className="site-review-school">{current.schoolName}</p> : null}
        </article>
        {showControls ? (
          <div className="site-review-nav">
            <button
              type="button"
              className="site-btn site-btn-ghost"
              onClick={() => setIndex((i) => (i === 0 ? reviews.length - 1 : i - 1))}
              aria-label="Previous review"
            >
              Previous
            </button>
            <span>
              {index + 1} / {reviews.length}
            </span>
            <button
              type="button"
              className="site-btn site-btn-ghost"
              onClick={() => setIndex((i) => (i + 1) % reviews.length)}
              aria-label="Next review"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function Home() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.hash, location.pathname]);

  return (
    <>
      <section className="site-hero">
        <div className="site-hero-copy">
          <p className="site-eyebrow">For school coordinators and administrators</p>
          <h1>Quiet, orderly teacher substitution — every morning, for every school.</h1>
          <p className="site-lead">
            Substitution Management System is built for the daily work of covering absent and
            on-duty teachers. Record availability, generate assignments using class-group
            eligibility, adjust them by hand, and print the sheet. Each school’s data stays on its
            own side of the platform.
          </p>
          <div className="site-hero-actions">
            <Link className="site-btn site-btn-primary" to="/contact">
              Get Started
            </Link>
            <Link className="site-btn site-btn-ghost" to="/contact">
              Contact Us
            </Link>
            <Link className="site-btn site-btn-text" to="/school-login">
              School Login
            </Link>
          </div>
        </div>
        <aside className="site-hero-panel" aria-label="What the product covers">
          <p className="site-panel-kicker">Today’s workflow</p>
          <ul>
            <li>Mark absent and on-duty teachers</li>
            <li>Find staff who are free that period</li>
            <li>Respect class-group eligibility</li>
            <li>Override when the office knows better</li>
            <li>Print or download the substitution sheet</li>
          </ul>
          <p className="site-panel-note">
            Generation follows the rules on the server. It does not rewrite the permanent timetable.
          </p>
        </aside>
      </section>

      <section className="site-section" id="features">
        <div className="site-section-head">
          <p className="site-eyebrow">Why schools use it</p>
          <h2>Benefits that match the real morning rush</h2>
          <p>
            The product is a substitution desk first: status, generation, review, override, and a
            printable record. Broader timetable editing is designed in, not claimed as finished.
          </p>
        </div>
        <div className="site-benefit-grid">
          {benefits.map((item) => (
            <article key={item.title} className="site-benefit">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-section site-section-alt" id="how-it-works">
        <div className="site-section-head">
          <p className="site-eyebrow">Process</p>
          <h2>How it works</h2>
          <p>Five steps from attendance to a sheet the whole office can use.</p>
        </div>
        <ol className="site-steps">
          {steps.map((step) => (
            <li key={step.n}>
              <span className="site-step-n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <HomeReviews />

      <section className="site-section" id="future">
        <div className="site-future">
          <div>
            <p className="site-eyebrow">Roadmap</p>
            <h2>Built to grow into complete school timetable management</h2>
            <p>
              Academic sessions, class groups, classes, sections, subjects, and timetable entries
              already sit in the database. A visual timetable builder is not in this release. When it
              ships, substitutions will continue to use those same records rather than a separate
              spreadsheet.
            </p>
          </div>
          <Link className="site-btn site-btn-primary" to="/contact">
            Talk to us about access
          </Link>
        </div>
      </section>
    </>
  );
}
