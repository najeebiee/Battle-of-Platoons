import React, { useEffect, useMemo, useState } from "react";
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
  const updatesLabel = isUser ? "My Updates" : "Updates History";
  const uploadLabel = isUser ? "My Input" : "Upload Data";
  const publishingLabel = isUser ? "My Publishing" : "Publishing";

  const primaryLinks = useMemo(() => {
    const items = [];

    if (!isUser) {
      items.push({ to: "/dashboard", icon: ICONS.dashboard, label: "Dashboard" });
    }

    if (isAdmin) {
      items.push({ to: "/participants", icon: ICONS.participants, label: "Participants" });
    }

    items.push({ to: "/updates", icon: ICONS.updates, label: updatesLabel });

    if (isAdmin) {
      items.push({ to: "/scoring-formulas", icon: ICONS.scoring, label: "Scoring Formulas" });
    }

    return items;
  }, [isUser, isAdmin, updatesLabel]);

  const toolLinks = useMemo(() => {
    const items = [
      { to: "/upload", icon: ICONS.upload, label: uploadLabel },
      { to: "/publishing", icon: ICONS.publishing, label: publishingLabel },
    ];

    if (isSuperAdmin) {
      items.push({ to: "/audit-log", icon: ICONS.audit, label: "Audit Log" });
      items.push({ to: "/finalization", icon: ICONS.finalization, label: "Week Finalization" });
    }

    return items;
  }, [isSuperAdmin, uploadLabel, publishingLabel]);

  return (
    <aside className="sidebar">
      <nav className="sb-nav sb-desktop">
        {primaryLinks.map(link => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
            <img className="sb-ico" src={link.icon} alt="" aria-hidden="true" />
            <span>{link.label}</span>
          </NavLink>
        ))}

        <div className="sb-divider" />
        <div className="sb-section">{isUser ? "MY TOOLS" : "TOOLS"}</div>

        {toolLinks.map(link => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}>
            <img className="sb-ico" src={link.icon} alt="" aria-hidden="true" />
            <span>{link.label}</span>
          </NavLink>
        ))}

        {/* Later: Download Template & Reset Sample can be inside Upload page */}
      </nav>
    </aside>
  );
}
