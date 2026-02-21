import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import ProtectedAuth from "./auth/ProtectedAuth";
import RoleRoute from "./auth/RoleRoute";

import AppShell from "./app/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Participants from "./pages/Participants";
import Updates from "./pages/Updates";
import Formulas from "./pages/Formulas";
import Upload from "./pages/Upload";
import Publishing from "./pages/Publishing";
import Finalization from "./pages/Finalization";
import AuditLog from "./pages/AuditLog";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedAuth>
                <AppShell />
              </ProtectedAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="dashboard"
              element={(
                <RoleRoute allowedRoles={["admin", "super_admin"]} redirectTo="/upload">
                  <Dashboard />
                </RoleRoute>
              )}
            />
            <Route
              path="participants"
              element={(
                <RoleRoute allowedRoles={["admin", "super_admin"]} redirectTo="/upload">
                  <Participants />
                </RoleRoute>
              )}
            />
            <Route path="updates" element={<Updates />} />
            <Route
              path="formulas"
              element={(
                <RoleRoute allowedRoles={["admin", "super_admin"]} redirectTo="/upload">
                  <Formulas />
                </RoleRoute>
              )}
            />
            <Route
              path="scoring-formulas"
              element={(
                <RoleRoute allowedRoles={["admin", "super_admin"]} redirectTo="/upload">
                  <Formulas />
                </RoleRoute>
              )}
            />
            <Route path="upload" element={<Upload />} />
            <Route path="publishing" element={<Publishing />} />
            <Route
              path="finalization"
              element={(
                <RoleRoute allowedRoles={["super_admin"]} redirectTo="/upload">
                  <Finalization />
                </RoleRoute>
              )}
            />
            <Route
              path="audit-log"
              element={(
                <RoleRoute allowedRoles={["super_admin"]} redirectTo="/upload">
                  <AuditLog />
                </RoleRoute>
              )}
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
