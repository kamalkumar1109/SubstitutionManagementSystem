import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { formatWhen, Notice, PageHead } from "../../components/app/Ui.jsx";

export default function AdminReviews() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    const data = await apiRequest("/api/admin/reviews");
    setRows(data.reviews || []);
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

  async function setPublished(id, published) {
    setBusyId(id);
    setError("");
    try {
      await apiRequest(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ published })
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
      <PageHead eyebrow="Public site" title="Reviews">
        <p>Show or hide school reviews on the home page.</p>
      </PageHead>
      <Notice loading={loading} error={error} />
      {!loading && !error ? (
        rows.length === 0 ? (
          <p className="app-muted">No reviews yet.</p>
        ) : (
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Rating</th>
                  <th>Review</th>
                  <th>Updated</th>
                  <th>Home page</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td>{row.schoolName}</td>
                    <td>{row.rating} / 5</td>
                    <td>{row.reviewMessage}</td>
                    <td>{formatWhen(row.updatedAt)}</td>
                    <td>
                      <select
                        className="app-select"
                        value={row.published ? "SHOW" : "HIDE"}
                        disabled={busyId === row._id}
                        onChange={(e) => setPublished(row._id, e.target.value === "SHOW")}
                      >
                        <option value="SHOW">Show</option>
                        <option value="HIDE">Hide</option>
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
