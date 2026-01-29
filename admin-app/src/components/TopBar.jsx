import React from "react";
import { useAuth } from "../auth/AuthProvider";

export default function TopBar() {
  const { user, logout } = useAuth();
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img src="/gg-logo.png" alt="Grinders Guild logo" className="topbar-brand-logo" />
        <div className="topbar-brand-text">Grinders Guild</div>
      </div>
      <div className="topbar-title">Battle of Platoons</div>

      <div className="topbar-right">
        <div className="topbar-date">{today}</div>
        <div className="topbar-user">
          <div className="topbar-avatar" />
          <div className="topbar-meta">
            <div className="topbar-name">{user?.email || "Admin"}</div>
            <div className="topbar-role">Admin</div>
          </div>

          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </div>
    </header>
  );
}
