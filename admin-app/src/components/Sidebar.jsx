import React from "react";
import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sb-header">
        <div className="sb-logo" />
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

        <NavLink to="/formulas" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          Scoring Formulas
        </NavLink>

        <div className="sb-section">TOOLS</div>

        <NavLink to="/upload" className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
          Upload Data
        </NavLink>

        {/* Later: Download Template & Reset Sample can be inside Upload page */}
      </nav>
    </aside>
  );
}
