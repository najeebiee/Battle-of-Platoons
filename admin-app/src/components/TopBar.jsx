import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { getMyProfile } from "../services/profile.service";

export default function TopBar() {
  const { user, logout } = useAuth();
  const [role, setRole] = useState("");

  useEffect(() => {
    let active = true;
    getMyProfile()
      .then(profile => {
        if (!active) return;
        setRole(profile?.role ?? "");
      })
      .catch(() => {
        if (!active) return;
        setRole("");
      });
    return () => {
      active = false;
    };
  }, []);

  const roleLabel =
    role === "super_admin"
      ? "Super Admin"
      : role === "admin"
        ? "Admin"
        : role === "user"
          ? "Participant Leader"
          : "Member";

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img src="/gg-logo.png" alt="Grinders Guild logo" className="topbar-brand-logo" />
        <div className="topbar-brand-text">Grinders Guild</div>
      </div>
      <div className="topbar-title">Battle of Platoons</div>

      <div className="topbar-user">
        <div className="topbar-avatar" />
        <div className="topbar-meta">
          <div className="topbar-name">{user?.email || "Admin"}</div>
          <div className="topbar-role">{roleLabel}</div>
        </div>
        <button className="topbar-logout" onClick={logout} aria-label="Logout" title="Logout">
          v
        </button>
      </div>
    </header>
  );
}

