import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { getMyProfile } from "../services/profile.service";

const ICONS = {
  dashboard: "/icons/dashboard.svg",
  participants: "/icons/participants.svg",
  updates: "/icons/updates.svg",
  scoring: "/icons/scoring.svg",
  broadcast: "/icons/broadcast.svg",
  upload: "/icons/upload.svg",
  download: "/icons/download.svg",
  reset: "/icons/reset.svg",
  publishing: "/icons/publishing.svg",
  audit: "/icons/audit.svg",
  finalization: "/icons/finalization.svg",
};

export default function Sidebar() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    let active = true;
    getMyProfile()
      .then(profile => {
        if (!active) return;
        setRole(profile?.role ?? null);
      })
      .catch(() => {
        if (!active) return;
        setRole(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const isSuperAdmin = role === "super_admin";
  const isUser = role === "user";
  const isAdmin = role === "admin" || role === "super_admin";

  return (
    <aside className="sidebar">
      <nav className="sb-nav">
        <NavLink to="/dashboard" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.dashboard} alt="" aria-hidden="true" />
          <span>{isUser ? "My Dashboard" : "Dashboard"}</span>
        </NavLink>

        {isAdmin ? (
          <NavLink to="/participants" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
            <img className="sb-ico" src={ICONS.participants} alt="" aria-hidden="true" />
            <span>Participants</span>
          </NavLink>
        ) : null}

        <NavLink to="/updates" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.updates} alt="" aria-hidden="true" />
          <span>{isUser ? "My Updates" : "Updates History"}</span>
        </NavLink>

        {isAdmin ? (
          <NavLink
            to="/scoring-formulas"
            className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}
          >
            <img className="sb-ico" src={ICONS.scoring} alt="" aria-hidden="true" />
            <span>Scoring Formulas</span>
          </NavLink>
        ) : null}

        <div className="sb-divider" />
        <div className="sb-section">{isUser ? "MY TOOLS" : "TOOLS"}</div>

        <NavLink to="/upload" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.upload} alt="" aria-hidden="true" />
          <span>{isUser ? "My Input" : "Upload Data"}</span>
        </NavLink>

        <NavLink to="/publishing" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.publishing} alt="" aria-hidden="true" />
          <span>{isUser ? "My Publishing" : "Publishing"}</span>
        </NavLink>

        {isSuperAdmin ? (
          <>
            <NavLink to="/audit-log" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
              <img className="sb-ico" src={ICONS.audit} alt="" aria-hidden="true" />
              <span>Audit Log</span>
            </NavLink>
            <NavLink to="/finalization" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
              <img className="sb-ico" src={ICONS.finalization} alt="" aria-hidden="true" />
              <span>Week Finalization</span>
            </NavLink>
          </>
        ) : null}

        {/* Later: Download Template & Reset Sample can be inside Upload page */}
      </nav>
    </aside>
  );
}
