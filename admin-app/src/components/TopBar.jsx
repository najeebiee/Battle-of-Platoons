import React from "react";
import { useAuth } from "../auth/AuthProvider";

export default function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img src="/gg-logo.png" alt="Grinders Guild logo" className="topbar-brand-logo" />
        <div className="topbar-brand-text">Grinders Guild</div>
        <span className="topbar-separator" aria-hidden="true">|</span>
      </div>
      <div className="topbar-title">Battle of Platoons</div>

      <div className="topbar-user">
        <div className="topbar-avatar" />
        <div className="topbar-meta">
          <div className="topbar-name">{user?.email || "Admin"}</div>
          <div className="topbar-role">Admin</div>
        </div>
        <button className="topbar-logout" onClick={logout} aria-label="Logout" title="Logout">
          ▾
        </button>
      </div>
    </header>
  );
}
