import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./api/auth";
import Shell from "./components/Shell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ExceptionsPage from "./pages/ExceptionsPage";
import ExceptionDetailPage from "./pages/ExceptionDetailPage";
import RunsPage from "./pages/RunsPage";
import AuditPage from "./pages/AuditPage";
import SpecStudioPage from "./pages/SpecStudioPage";

function Protected({ children }) {
  const { token, booting } = useAuth();
  if (booting) return <div className="boot">Loading FinDataGraph…</div>;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/studio" replace />} />
        <Route path="studio" element={<SpecStudioPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="exceptions" element={<ExceptionsPage />} />
        <Route path="exceptions/:id" element={<ExceptionDetailPage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/studio" replace />} />
    </Routes>
  );
}
