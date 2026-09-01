import React from "react";

export default function TeacherList({ teachers, onToggle }) {
  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Teachers</div>
          <div className="cardSub">One-click Present/Absent</div>
        </div>
        <div className="pill">{teachers.length} total</div>
      </div>

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 64 }}>ID</th>
              <th>Name</th>
              <th>Subjects</th>
              <th style={{ width: 170 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.id}</td>
                <td className="strong">{t.name}</td>
                <td className="muted">{(t.subjects || []).join(", ")}</td>
                <td>
                  <button
                    className={`toggle ${t.status === "present" ? "on" : "off"}`}
                    onClick={() =>
                      onToggle(
                        t.id,
                        t.status === "present" ? "absent" : "present"
                      )
                    }
                    title="Toggle attendance"
                  >
                    {t.status === "present" ? "Present" : "Absent"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

