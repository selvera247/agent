import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../api/auth";
import AuthControls from "../auth/AuthControls";

const links = [
  { to: "/studio", label: "Spec Studio", end: true },
  { to: "/jumpstart", label: "Jumpstart" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/exceptions", label: "Exceptions" },
  { to: "/runs", label: "Runs" },
  { to: "/sources", label: "Sources" },
  { to: "/connectors", label: "Connectors" },
  { to: "/evidence", label: "Evidence" },
  { to: "/audit", label: "Audit" },
];

export default function Shell() {
  const { user, logout, authConfig } = useAuth();
  const clerkMode = (authConfig?.mode || "local") === "clerk";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          FinDataGraph
          <span>Financial data graph</span>
        </div>
        <nav className="nav-list" aria-label="App">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              data-testid={`nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <strong>{user?.name}</strong>
          <span>
            {user?.role} · {user?.email}
          </span>
          {clerkMode ? <AuthControls /> : null}
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
