import React from "react";
import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <section className="site-page site-page-narrow">
      <h1>Privacy</h1>
      <p className="site-lead">
        This page is a placeholder until a full policy is published. Enquiries submitted through the
        contact form are stored so we can reply. Do not send passwords, payment card numbers, or
        student records through that form.
      </p>
      <p>
        School operational data (teachers, timetables, substitutions) is held per school and is not
        shown on this public website.
      </p>
      <p>
        <Link to="/contact">Contact us</Link> if you want an enquiry removed.
      </p>
    </section>
  );
}
