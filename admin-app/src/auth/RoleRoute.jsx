import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getMyProfile } from "../services/profile.service";

export default function RoleRoute({ allowedRoles = [], children }) {
  const [loading, setLoading] = useState(true);
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
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;
  return children;
}
