import React from "react";

function monthLabel(value) {
  if (!value || !String(value).includes("-")) return value;
  const [y, m] = String(value).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${y}`;
}

export default function AdminChart({ title, items, labelKey = "label", valueKey = "value", formatValue }) {
  const rows = items || [];
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <section className="admin-chart">
      <h2 className="app-h2">{title}</h2>
      {rows.length === 0 ? (
        <p className="app-muted">No data yet.</p>
      ) : (
        <ul className="admin-chart-list">
          {rows.map((row) => {
            const label = row[labelKey];
            const value = Number(row[valueKey] || 0);
            return (
              <li key={`${label}-${value}`}>
                <span className="admin-chart-label">{monthLabel(label)}</span>
                <span className="admin-chart-track">
                  <span style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
                </span>
                <strong>{formatValue ? formatValue(value) : value}</strong>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
