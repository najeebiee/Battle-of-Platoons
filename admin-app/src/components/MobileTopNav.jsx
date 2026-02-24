import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

export default function MobileTopNav({ role }) {
  const { pathname } = useLocation();
  const [openItem, setOpenItem] = useState(null);

  useEffect(() => {
    setOpenItem(null);
  }, [pathname]);

  const isSuperAdmin = role === "super_admin";
  const isUser = role === "user";
  const isAdmin = role === "admin" || role === "super_admin";

  const updatesLabel = isUser ? "My Updates" : "Updates History";
  const uploadLabel = isUser ? "My Input" : "Upload Data";
  const publishingLabel = isUser ? "My Publishing" : "Publishing";

  const primaryItems = useMemo(() => {
    const items = [];

    if (!isUser) items.push({ id: "dashboard", to: "/dashboard", label: "Dashboard" });
    if (isAdmin) items.push({ id: "participants", to: "/participants", label: "Participants" });

    items.push({ id: "updates", to: "/updates", label: updatesLabel });

    if (isAdmin) items.push({ id: "scoring", to: "/scoring-formulas", label: "Scoring Formulas" });
    return items;
  }, [isUser, isAdmin, updatesLabel]);

  const tools = useMemo(() => {
    const items = [
      { to: "/upload", label: uploadLabel },
      { to: "/publishing", label: publishingLabel },
    ];
    if (isSuperAdmin) {
      items.push({ to: "/audit-log", label: "Audit Log" });
      items.push({ to: "/finalization", label: "Week Finalization" });
    }
    return items;
  }, [isSuperAdmin, uploadLabel, publishingLabel]);

  const items = useMemo(
    () => [...primaryItems, { id: "tools", label: isUser ? "My Tools" : "Tools", children: tools }],
    [primaryItems, tools, isUser]
  );

  const activeIndex = useMemo(() => {
    const idx = items.findIndex(item => {
      if (item.to) return pathname.startsWith(item.to);
      return item.children?.some(child => pathname.startsWith(child.to));
    });
    return idx >= 0 ? idx : 0;
  }, [items, pathname]);

  const underlineStyle = useMemo(() => {
    const width = items.length ? 100 / items.length : 100;
    return { width: `${width}%`, transform: `translateX(${activeIndex * 100}%)` };
  }, [items.length, activeIndex]);

  return (
    <div className="sb-mobile" aria-label="Mobile navigation">
      <nav className="sb-mobile-nav">
        {items.map(item => {
          const hasChildren = Boolean(item.children?.length);
          const isExpanded = openItem === item.id;

          if (!hasChildren) {
            return (
              <NavLink
                key={item.id}
                to={item.to}
                className={({ isActive }) => "sb-mobile-item" + (isActive ? " active" : "")}
                onClick={() => setOpenItem(null)}
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
              onClick={() => setOpenItem(isExpanded ? null : item.id)}
            >
              {item.label}
            </button>
          );
        })}
        <div className="sb-mobile-underline" style={underlineStyle} />
      </nav>

      {items
        .filter(item => item.children?.length)
        .map(item => {
          const isExpanded = openItem === item.id;
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
                    onClick={() => setOpenItem(null)}
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
