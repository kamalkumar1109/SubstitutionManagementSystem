import React from "react";
import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <section className="site-page site-page-narrow">
      <h1>Terms</h1>
      <p className="site-lead">
        This page is a placeholder. Access to a live school workspace is provided under a separate
        subscription or onboarding arrangement, not by creating an account on this public site.
      </p>
      <p>
        Generated substitutions are operational aids. Schools remain responsible for final classroom
        arrangements.
      </p>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </section>
  );
}
