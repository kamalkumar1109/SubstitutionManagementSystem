import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { Flash } from "./Ui.jsx";

export default function SchoolReviewForm() {
  const [review, setReview] = useState(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest("/api/reviews/mine")
      .then((data) => {
        setReview(data.review);
        setRating(data.review?.rating || 0);
        setMessage(data.review?.reviewMessage || "");
      })
      .catch((err) => setError(err.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!rating) {
      setError("Choose a rating from 1 to 5 stars.");
      return;
    }
    if (!message.trim()) {
      setError("Review message is required.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest("/api/reviews/mine", {
        method: "PUT",
        body: JSON.stringify({ rating, reviewMessage: message.trim() })
      });
      setReview(data.review);
      setFlash(review ? "Review updated." : "Review published.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/reviews/mine", { method: "DELETE" });
      setReview(null);
      setRating(0);
      setMessage("");
      setFlash("Review deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || rating;

  return (
    <div className="review-card">
      <Flash message={flash} />
      {error ? (
        <p className="site-alert site-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="site-form review-form" onSubmit={save}>
        <div className="site-form-field">
          <span>Rating</span>
          <div className="star-row" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => {
              const on = shown >= n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`star-btn${on ? " is-on" : ""}`}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  aria-pressed={rating >= n}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onFocus={() => setHover(n)}
                  onBlur={() => setHover(0)}
                  onClick={() => setRating(n)}
                >
                  {on ? "★" : "☆"}
                </button>
              );
            })}
          </div>
        </div>
        <div className="site-form-field">
          <label htmlFor="review-message">Review message</label>
          <textarea
            id="review-message"
            className="review-textarea"
            rows="4"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us about your experience using the Substitution Management System..."
            required
          />
        </div>
        <div className="app-page-actions">
          <button className="site-btn site-btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : review ? "Update Review" : "Publish Review"}
          </button>
          {review ? (
            <button type="button" className="site-btn site-btn-danger" onClick={remove} disabled={busy}>
              Delete Review
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
