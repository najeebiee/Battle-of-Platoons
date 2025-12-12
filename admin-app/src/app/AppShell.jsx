import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";

export default function AppShell() {
  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <TopBar />
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
