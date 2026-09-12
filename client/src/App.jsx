import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, homeForRole, useAuth } from "./auth/AuthContext.jsx";
import ProtectedRoute, { GuestOnly, SchoolWorkspaceGate } from "./auth/ProtectedRoute.jsx";
import PublicLayout from "./components/site/PublicLayout.jsx";
import Home from "./pages/Home.jsx";
import Contact from "./pages/Contact.jsx";
import Login from "./pages/Login.jsx";
import SchoolLogin from "./pages/SchoolLogin.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import NotFound from "./pages/NotFound.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SchoolLayout from "./layouts/SchoolLayout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
import SchoolDashboard from "./pages/school/SchoolDashboard.jsx";
import SchoolSubstitutions from "./pages/school/SchoolSubstitutions.jsx";
import SubstitutionPrint from "./pages/school/SubstitutionPrint.jsx";
import SchoolTeachers from "./pages/school/SchoolTeachers.jsx";
import SchoolClasses from "./pages/school/SchoolClasses.jsx";
import SchoolSubjects from "./pages/school/SchoolSubjects.jsx";
import SchoolTimetable from "./pages/school/SchoolTimetable.jsx";
import SchoolTimetableEditor from "./pages/school/SchoolTimetableEditor.jsx";
import SchoolSettings from "./pages/school/SchoolSettings.jsx";
import SchoolBilling from "./pages/school/SchoolBilling.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import AdminSchools from "./pages/admin/AdminSchools.jsx";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions.jsx";
import AdminPayments from "./pages/admin/AdminPayments.jsx";
import AdminEnquiries from "./pages/admin/AdminEnquiries.jsx";
import AdminPlans from "./pages/admin/AdminPlans.jsx";
import AdminSettings from "./pages/admin/AdminSettings.jsx";
import AdminReviews from "./pages/admin/AdminReviews.jsx";
import AdminSchoolDetail from "./pages/admin/AdminSchoolDetail.jsx";

function AccountRedirect() {
  const { ready, user } = useAuth();
  if (!ready) return <div className="app-loading">Checking your session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRole(user.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/school-login" element={<GuestOnly><SchoolLogin /></GuestOnly>} />
            <Route path="/admin-login" element={<GuestOnly><AdminLogin /></GuestOnly>} />
            <Route path="/account" element={<AccountRedirect />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
          </Route>

          <Route
            path="/school/substitutions/print"
            element={
              <ProtectedRoute roles={["SCHOOL_ADMIN", "SUPER_ADMIN"]}>
                <SchoolWorkspaceGate>
                  <SubstitutionPrint />
                </SchoolWorkspaceGate>
              </ProtectedRoute>
            }
          />

          <Route
            path="/school"
            element={
              <ProtectedRoute roles={["SCHOOL_ADMIN", "SUPER_ADMIN"]}>
                <SchoolWorkspaceGate>
                  <SchoolLayout />
                </SchoolWorkspaceGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<SchoolDashboard />} />
            <Route path="substitutions" element={<SchoolSubstitutions />} />
            <Route path="teachers" element={<SchoolTeachers />} />
            <Route path="classes" element={<SchoolClasses />} />
            <Route path="subjects" element={<SchoolSubjects />} />
            <Route path="timetable/:timetableId" element={<SchoolTimetableEditor />} />
            <Route path="timetable" element={<SchoolTimetable />} />
            <Route path="billing" element={<SchoolBilling />} />
            <Route path="settings" element={<SchoolSettings />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["SUPER_ADMIN"]}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="schools" element={<AdminSchools />} />
            <Route path="schools/:schoolId" element={<AdminSchoolDetail />} />
            <Route path="subscriptions" element={<AdminSubscriptions />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="enquiries" element={<AdminEnquiries />} />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="plans" element={<AdminPlans />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="/workspace" element={<Dashboard />} />
          <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
