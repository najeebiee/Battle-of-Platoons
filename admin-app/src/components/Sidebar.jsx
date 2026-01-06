import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { getMyProfile } from "../services/profile.service";

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
          Dashboard
        </NavLink>

        <NavLink to="/participants" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          Participants
        </NavLink>

        <NavLink to="/updates" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          Updates History
        </NavLink>

        <NavLink
          to="/scoring-formulas"
          className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}
        >
          Scoring Formulas
        </NavLink>

        <div className="sb-section">TOOLS</div>

        <NavLink to="/upload" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          Upload Data
        </NavLink>

        <NavLink to="/compare" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          Compare Data
        </NavLink>

        <NavLink to="/publishing" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          Publishing
        </NavLink>

        {isSuperAdmin ? (
          <NavLink to="/finalization" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
            Week Finalization
          </NavLink>
        ) : null}

        {/* Later: Download Template & Reset Sample can be inside Upload page */}
      </nav>
    </aside>
  );
}
