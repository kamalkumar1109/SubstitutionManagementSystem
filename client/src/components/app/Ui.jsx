import React from "react";

export function PageHead({ eyebrow, title, actions, children }) {
  return (
    <header className="app-page-head">
      <div className="app-page-head-row">
        <div>
          {eyebrow ? <p className="site-eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
        </div>
        {actions ? <div className="app-page-actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

export function Flash({ message, kind = "ok" }) {
  if (!message) return null;
  return (
    <p className={`site-alert site-alert-${kind === "error" ? "error" : "ok"}`} role="status">
      {message}
    </p>
  );
}

export function Notice({ error, loading }) {
  if (loading) return <p className="app-muted">Loading…</p>;
  if (error) {
    return (
      <p className="site-alert site-alert-error" role="alert">
        {error}
      </p>
    );
  }
  return null;
}

export function MetricGrid({ items }) {
  return (
    <div className="app-metrics">
      {items.map((item) => (
        <article key={item.label} className="app-metric">
          <p>{item.label}</p>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  );
}

export function SimpleTable({ columns, rows, empty }) {
  if (!rows?.length) return <p className="app-muted">{empty || "No records yet."}</p>;
  return (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || row._id || i}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key] || "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatDateKey(dateKey) {
  if (!dateKey) return "—";
  const [y, m, d] = dateKey.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export function formatLongDate(dateKey) {
  if (!dateKey) return "—";
  const [y, m, d] = dateKey.split("-");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

export function formatDay(day) {
  if (!day) return "—";
  return day.charAt(0) + day.slice(1).toLowerCase();
}

export function formatMoney(amount, currency = "INR") {
  if (amount == null || amount === "") return "—";
  return `${currency} ${Number(amount).toLocaleString("en-IN")}`;
}

export function formatWhen(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}
