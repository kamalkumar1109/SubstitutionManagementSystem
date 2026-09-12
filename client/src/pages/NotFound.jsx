import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="site">
      <section className="site-page site-page-narrow">
      <h1>Page not found</h1>
      <p className="site-lead">
        That address is not part of the public site. Return <Link to="/">home</Link> or{" "}
        <Link to="/contact">contact us</Link>.
      </p>
    </section>
    </div>
  );
}
