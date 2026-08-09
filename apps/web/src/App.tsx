import { useAuth } from "@/hooks/use-auth.ts";
import { AnnotatePage } from "@/pages/annotate.tsx";
import { LoginPage } from "@/pages/login.tsx";
import { ProjectsPage } from "@/pages/projects.tsx";
import { Navigate, Route, Routes } from "react-router-dom";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/projects/:projectId/annotate" element={<AnnotatePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
