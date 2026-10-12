import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../api/auth";

const links = [
  { to: "/studio", label: "Spec Studio", end: true },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/exceptions", label: "Exceptions" },
  { to: "/runs", label: "Runs" },
  { to: "/audit", label: "Audit" },
];

export default function Shell() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          FinDataGraph
          <span>Financial data graph</span>
        </div>
        <nav className="nav-list" aria-label="App">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <strong>{user?.name}</strong>
          <span>
            {user?.role} · {user?.email}
          </span>
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
