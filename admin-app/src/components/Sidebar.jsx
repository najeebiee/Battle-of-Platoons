import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
  const [openMobileItem, setOpenMobileItem] = useState(null);
  const { pathname } = useLocation();

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

  const mobileItems = useMemo(
    () => [
      ...primaryLinks.map(link => ({ ...link, id: link.to })),
      { id: "tools", label: isUser ? "My Tools" : "Tools", children: toolLinks },
    ],
    [primaryLinks, toolLinks, isUser]
  );

  const activeMobileIndex = useMemo(() => {
    const foundIndex = mobileItems.findIndex(item => {
      if (item.to) return pathname.startsWith(item.to);
      return item.children?.some(child => pathname.startsWith(child.to));
    });

    return foundIndex >= 0 ? foundIndex : 0;
  }, [mobileItems, pathname]);

  const mobileUnderlineStyle = useMemo(() => {
    const width = mobileItems.length ? 100 / mobileItems.length : 100;
    return {
      width: `${width}%`,
      transform: `translateX(${activeMobileIndex * 100}%)`,
    };
  }, [mobileItems.length, activeMobileIndex]);

  return (
    <aside className="sidebar">
      <div className="sb-mobile" aria-label="Mobile navigation">
        <nav className="sb-mobile-nav">
          {mobileItems.map(item => {
            const hasChildren = Boolean(item.children?.length);
            const isExpanded = openMobileItem === item.id;

            if (!hasChildren) {
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={({ isActive }) => "sb-mobile-item" + (isActive ? " active" : "")}
                  onClick={() => setOpenMobileItem(null)}
                >
                  {item.label}
                </NavLink>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                className={"sb-mobile-item sb-mobile-item-button" + (isExpanded ? " active" : "")}
                aria-expanded={isExpanded}
                aria-controls={`sb-mobile-panel-${item.id}`}
                onClick={() => setOpenMobileItem(isExpanded ? null : item.id)}
              >
                {item.label}
              </button>
            );
          })}
          <div className="sb-mobile-underline" style={mobileUnderlineStyle} />
        </nav>

        {mobileItems.map(item => {
          const hasChildren = Boolean(item.children?.length);
          if (!hasChildren) return null;

          const isExpanded = openMobileItem === item.id;

          return (
            <div
              key={item.id}
              id={`sb-mobile-panel-${item.id}`}
              className={"sb-mobile-dropdown" + (isExpanded ? " open" : "")}
            >
              <div className="sb-mobile-dropdown-inner">
                {item.children.map(child => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={({ isActive }) => "sb-mobile-dropdown-link" + (isActive ? " active" : "")}
                    onClick={() => setOpenMobileItem(null)}
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </div>

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
