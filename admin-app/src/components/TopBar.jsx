import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { getMyProfile } from "../services/profile.service";
import MobileTopNav from "./MobileTopNav";

export default function TopBar() {
  const { user, logout } = useAuth();
  const [role, setRole] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const userMenuRef = useRef(null);

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

  useEffect(() => {
    function onPointerDown(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img src="/gg-logo.png" alt="Grinders Guild logo" className="topbar-brand-logo" />
      </div>

      <div className="topbar-center-nav">
        <MobileTopNav role={role} />
      </div>

      <div className="topbar-user" ref={userMenuRef}>
        <button
          type="button"
          className="topbar-avatar-button"
          aria-label="Profile menu"
          aria-expanded={isProfileOpen}
          onClick={() => setIsProfileOpen(open => !open)}
        >
          <div className="topbar-avatar" />
        </button>

        {isProfileOpen ? (
          <div className="topbar-user-popover">
            <div className="topbar-meta">
              <div className="topbar-name">{user?.email || "Admin"}</div>
              <div className="topbar-role">{roleLabel}</div>
            </div>
            <button className="topbar-logout" onClick={logout} aria-label="Logout" title="Logout">
              Logout
            </button>
          </div>
        ) : null}
      </div>

    </header>
  );
}

