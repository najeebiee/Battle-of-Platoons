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
  compare: "/icons/compare.svg",
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

  return (
    <aside className="sidebar">
      <div className="sb-header">
        <img src="/gg-logo.png" alt="Grinders Guild logo" className="sb-logo" />
        <div className="sb-brand">Grinders Guild</div>
      </div>

      <nav className="sb-nav">
        <NavLink to="/dashboard" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.dashboard} alt="" aria-hidden="true" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/participants" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.participants} alt="" aria-hidden="true" />
          <span>Participants</span>
        </NavLink>

        <NavLink to="/updates" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.updates} alt="" aria-hidden="true" />
          <span>Updates History</span>
        </NavLink>

        <NavLink
          to="/scoring-formulas"
          className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}
        >
          <img className="sb-ico" src={ICONS.scoring} alt="" aria-hidden="true" />
          <span>Scoring Formulas</span>
        </NavLink>

        <div className="sb-divider" />
        <div className="sb-section">TOOLS</div>

        <NavLink to="/upload" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.upload} alt="" aria-hidden="true" />
          <span>Upload Data</span>
        </NavLink>

        <NavLink to="/compare" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.compare} alt="" aria-hidden="true" />
          <span>Compare Data</span>
        </NavLink>

        <NavLink to="/publishing" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          <img className="sb-ico" src={ICONS.publishing} alt="" aria-hidden="true" />
          <span>Publishing</span>
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
