import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { formatWhen, Notice, PageHead } from "../../components/app/Ui.jsx";

const STATUSES = ["NEW", "CONTACTED", "CLOSED"];

function displayStatus(status) {
  if (status === "REVIEWED") return "CONTACTED";
  return status || "NEW";
}

export default function AdminEnquiries() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    const data = await apiRequest("/api/admin/enquiries");
    setRows(data.enquiries || []);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function changeStatus(id, status) {
    setBusyId(id);
    setError("");
    try {
      await apiRequest(`/api/admin/enquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <PageHead eyebrow="Inbound" title="Enquiries">
        <p>Messages submitted from the public contact page.</p>
      </PageHead>
      <Notice loading={loading} error={error} />
      {!loading && !error ? (
        rows.length === 0 ? (
          <p className="app-muted">No enquiries yet.</p>
        ) : (
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>School name</th>
                  <th>Contact person</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Message</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td>{row.schoolName || "—"}</td>
                    <td>{row.contactPerson || "—"}</td>
                    <td>{row.email}</td>
                    <td>{row.phone || "—"}</td>
                    <td className="admin-message">{row.message || "—"}</td>
                    <td>{formatWhen(row.createdAt)}</td>
                    <td>
                      <select
                        className="app-select"
                        value={displayStatus(row.status)}
                        disabled={busyId === row._id}
                        onChange={(e) => changeStatus(row._id, e.target.value)}
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </>
  );
}
