import React, { useEffect } from "react";

export default function Modal({ title, children, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="app-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="app-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal-head">
          <h2 id="app-modal-title">{title}</h2>
          <button type="button" className="app-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="app-modal-copy">{message}</p>
      <div className="app-modal-actions">
        <button type="button" className="site-btn site-btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`site-btn ${danger ? "site-btn-danger" : "site-btn-primary"}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Please wait…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
