import React from "react";
import { useAuth } from "../auth/AuthProvider";

export default function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <div />
      <div className="topbar-title">Battle of Platoons</div>

      <div className="topbar-user">
        <div className="topbar-avatar" />
        <div className="topbar-meta">
          <div className="topbar-name">{user?.email || "Admin"}</div>
          <div className="topbar-role">Admin</div>
        </div>

        <button className="btn" onClick={logout}>Logout</button>
      </div>
    </header>
  );
}
