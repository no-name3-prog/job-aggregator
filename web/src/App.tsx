import { NavLink, Route, Routes } from "react-router-dom";
import ApplicationsPage from "./pages/ApplicationsPage";
import DashboardPage from "./pages/DashboardPage";
import JobDetailPage from "./pages/JobDetailPage";
import JobsPage from "./pages/JobsPage";
import ResumePage from "./pages/ResumePage";

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          DE <span>Apply</span> Tracker
        </div>
        <div className="brand-sub">Manual apply · free stack · no auto-apply</div>
        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/jobs">DE Jobs</NavLink>
          <NavLink to="/applications">Applications</NavLink>
          <NavLink to="/resume">Resume</NavLink>
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/resume" element={<ResumePage />} />
        </Routes>
      </main>
    </div>
  );
}
