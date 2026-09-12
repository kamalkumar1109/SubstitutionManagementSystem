import React, { useEffect, useMemo } from "react";

function idOf(value) {
  if (value == null) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
}

export function classGroupIdsOf(klass) {
  if (!klass) return [];
  const ids = [];
  (klass.classGroupIds || []).forEach((id) => {
    const value = idOf(id);
    if (value) ids.push(value);
  });
  (klass.classGroups || []).forEach((group) => {
    const value = idOf(group);
    if (value) ids.push(value);
  });
  const home = idOf(klass.classGroupId);
  if (home) ids.push(home);
  return [...new Set(ids)];
}

export function teacherSubjectList(teacher, allSubjects) {
  if (!teacher) return [];
  const assigned = teacher.subjects || [];
  if (!assigned.length) return allSubjects;
  return assigned
    .map((row) => (row && row.name ? row : allSubjects.find((s) => idOf(s) === idOf(row))))
    .filter(Boolean);
}

export function classesForTeacher(teacher, classes) {
  if (!teacher) return classes;
  const groups = (teacher.eligibleClassGroups || []).map(idOf).filter(Boolean);
  if (!groups.length) return classes;
  return classes.filter((klass) => classGroupIdsOf(klass).some((id) => groups.includes(id)));
}

export function teachersForClass(teachers, klass) {
  if (!klass) return teachers;
  const groupId = idOf(klass.classGroupId);
  const classGroups = classGroupIdsOf(klass);
  if (!groupId && !classGroups.length) return teachers;
  return teachers.filter((teacher) => {
    const groups = (teacher.eligibleClassGroups || []).map(idOf).filter(Boolean);
    if (!groups.length) return true;
    return classGroups.some((id) => groups.includes(id)) || groups.includes(groupId);
  });
}

export function defaultSubjectId(teacher, subjects, preferred) {
  const list = teacherSubjectList(teacher, subjects);
  if (preferred && list.some((s) => idOf(s) === String(preferred))) return String(preferred);
  if (list.length === 1) return idOf(list[0]);
  return preferred && list.some((s) => idOf(s) === String(preferred)) ? String(preferred) : "";
}

export const ASSIGNMENT_TYPES = [
  { value: "CLASS", label: "Normal Class" },
  { value: "MEETING", label: "Meeting" },
  { value: "ACTIVITY", label: "Activity" }
];

export default function LessonForm({
  form,
  setForm,
  teachers,
  classes,
  sections,
  subjects,
  lockTeacher,
  lockClass,
  lockSection,
  isEdit
}) {
  const selectedTeacher = teachers.find((t) => idOf(t) === String(form.teacherId));
  const partnerTeacher = teachers.find((t) => idOf(t) === String(form.partnerTeacherId));
  const subjectOptions = teacherSubjectList(selectedTeacher, subjects);
  const partnerSubjectOptions = teacherSubjectList(partnerTeacher, subjects);
  const classOptions = lockClass ? classes : classesForTeacher(selectedTeacher, classes);
  const teacherOptions = lockClass
    ? teachersForClass(teachers, classes.find((c) => idOf(c) === String(form.classId)))
    : teachers;
  const sectionOptions = sections.filter((row) => idOf(row.classId) === String(form.classId));
  const classLesson = form.assignmentType === "CLASS" || !form.assignmentType;
  const meetingLesson = form.assignmentType === "MEETING";
  const activityLesson = form.assignmentType === "ACTIVITY";
  const classLike = classLesson || activityLesson;
  const classRequired = classLesson;
  const combined = classLesson && form.alternateWeek === true;
  const singleSubject = subjectOptions.length === 1;
  const singlePartnerSubject = partnerSubjectOptions.length === 1;

  useEffect(() => {
    if (!selectedTeacher) return;
    const nextSubject = defaultSubjectId(selectedTeacher, subjects, form.subjectId);
    const eligible = classesForTeacher(selectedTeacher, classes);
    let nextClass = form.classId;
    if (!lockClass && nextClass && eligible.length && !eligible.some((c) => idOf(c) === String(nextClass))) {
      nextClass = "";
    }
    if (nextSubject !== form.subjectId || nextClass !== form.classId) {
      setForm((prev) => ({
        ...prev,
        subjectId: nextSubject,
        classId: classLesson ? nextClass : meetingLesson ? "" : prev.classId,
        sectionId: classLesson ? (nextClass === prev.classId ? prev.sectionId : "") : meetingLesson ? "" : prev.sectionId
      }));
    }
  }, [form.teacherId, form.assignmentType]);

  useEffect(() => {
    if (!partnerTeacher) return;
    const next = defaultSubjectId(partnerTeacher, subjects, form.partnerSubjectId);
    if (next !== form.partnerSubjectId) {
      setForm((prev) => ({ ...prev, partnerSubjectId: next }));
    }
  }, [form.partnerTeacherId]);

  const partnerSubjectName = useMemo(() => {
    const hit = partnerSubjectOptions.find((s) => idOf(s) === String(form.partnerSubjectId));
    return hit?.name || "";
  }, [partnerSubjectOptions, form.partnerSubjectId]);

  return (
    <>
      <div className="site-form-field">
        <label htmlFor="ent-type">Lesson type</label>
        <select
          id="ent-type"
          value={form.assignmentType || "CLASS"}
          onChange={(e) => {
            const assignmentType = e.target.value;
            setForm({
              ...form,
              assignmentType,
              classId: assignmentType === "MEETING" ? "" : form.classId,
              sectionId: assignmentType === "MEETING" ? "" : form.sectionId,
              alternateWeek: assignmentType === "CLASS" ? form.alternateWeek : false,
              followLeadSection: assignmentType === "CLASS" ? form.followLeadSection : false,
              weekPattern: assignmentType === "CLASS" ? form.weekPattern : "EVERY"
            });
          }}
        >
          {ASSIGNMENT_TYPES.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
      </div>
      <div className="site-form-field">
        <label htmlFor="ent-teacher">Teacher</label>
        <select
          id="ent-teacher"
          value={form.teacherId}
          onChange={(e) => setForm({ ...form, teacherId: e.target.value, subjectId: "", classId: lockClass ? form.classId : "", sectionId: lockSection ? form.sectionId : "" })}
          required
          disabled={lockTeacher}
        >
          <option value="">Select</option>
          {teacherOptions.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="site-form-field">
        <label htmlFor="ent-subject">Subject</label>
        <select
          id="ent-subject"
          value={form.subjectId}
          onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
          required={classLike}
          disabled={singleSubject && classLike}
        >
          <option value="">Select</option>
          {subjectOptions.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {classLike ? (
      <div className="site-form-field">
        <label htmlFor="ent-class">Class{classRequired ? "" : " (optional)"}</label>
        <select
          id="ent-class"
          value={form.classId}
          onChange={(e) => setForm({ ...form, classId: e.target.value, sectionId: lockSection ? form.sectionId : "" })}
          required={classRequired}
          disabled={lockClass}
        >
          <option value="">{classRequired ? "Select" : "None"}</option>
          {classOptions.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      ) : null}
      {classLike && combined ? (
        <div className="site-form-field">
          <label htmlFor="ent-combined">Combined label</label>
          <input
            id="ent-combined"
            value={form.combinedLabel}
            onChange={(e) => setForm({ ...form, combinedLabel: e.target.value })}
            placeholder="e.g. 7AB"
            required
          />
        </div>
      ) : classLike ? (
        <div className="site-form-field">
          <label htmlFor="ent-section">Section{classRequired ? "" : " (optional)"}</label>
          <select
            id="ent-section"
            value={form.sectionId}
            onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
            required={classRequired}
            disabled={lockSection || (!classRequired && !form.classId)}
          >
            <option value="">{classRequired ? "Select" : "None"}</option>
            {sectionOptions.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="site-form-field">
        <label htmlFor="ent-comment">Add comment</label>
        <textarea
          id="ent-comment"
          value={form.comment || ""}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
          rows={2}
        />
      </div>
      {classLike ? (
      <div className="site-form-field">
        <label htmlFor="ent-week">Week pattern</label>
        <select
          id="ent-week"
          value={form.weekPattern}
          onChange={(e) => setForm({ ...form, weekPattern: e.target.value })}
          disabled={combined}
        >
          <option value="EVERY">Every week</option>
          <option value="ODD">Odd week only</option>
          <option value="EVEN">Even week only</option>
        </select>
      </div>
      ) : null}
      {classLike && !combined ? (
        <div className="site-form-field">
          <label htmlFor="ent-combined-opt">Combined label (optional)</label>
          <input
            id="ent-combined-opt"
            value={form.combinedLabel}
            onChange={(e) => setForm({ ...form, combinedLabel: e.target.value })}
            placeholder="e.g. 7AB"
          />
        </div>
      ) : null}
      {!isEdit && classLike ? (
        <>
          <label className="tt-check">
            <input
              type="checkbox"
              checked={form.alternateWeek}
              onChange={(e) =>
                setForm({
                  ...form,
                  alternateWeek: e.target.checked,
                  weekPattern: e.target.checked ? "ODD" : "EVERY",
                  sectionId: e.target.checked ? "" : form.sectionId
                })
              }
            />
            Alternate-week combined assignment
          </label>
          {combined || form.followLeadSection ? (
            <>
              <div className="site-form-field">
                <label htmlFor="ent-partner">Partner teacher</label>
                <select
                  id="ent-partner"
                  value={form.partnerTeacherId}
                  onChange={(e) => setForm({ ...form, partnerTeacherId: e.target.value, partnerSubjectId: "" })}
                  required={combined}
                >
                  <option value="">Select</option>
                  {teachers
                    .filter((t) => idOf(t) !== String(form.teacherId))
                    .map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>
              {form.partnerTeacherId ? (
                <div className="site-form-field">
                  <label htmlFor="ent-partner-subject">Partner subject</label>
                  {singlePartnerSubject ? (
                    <input id="ent-partner-subject" value={partnerSubjectName} readOnly />
                  ) : (
                    <select
                      id="ent-partner-subject"
                      value={form.partnerSubjectId}
                      onChange={(e) => setForm({ ...form, partnerSubjectId: e.target.value })}
                      required
                    >
                      <option value="">Select</option>
                      {partnerSubjectOptions.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
          <label className="tt-check">
            <input
              type="checkbox"
              checked={form.followLeadSection}
              onChange={(e) => setForm({ ...form, followLeadSection: e.target.checked })}
            />
            Isolated section follows the odd-week lead teacher (e.g. 8G with 8EF)
          </label>
        </>
      ) : null}
      <div className="site-form-field">
        <label htmlFor="ent-room">Room</label>
        <input id="ent-room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
      </div>
    </>
  );
}
