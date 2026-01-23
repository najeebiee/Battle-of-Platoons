import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import ProtectedAuth from "./auth/ProtectedAuth";

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
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="participants" element={<Participants />} />
            <Route path="updates" element={<Updates />} />
            <Route path="formulas" element={<Formulas />} />
            <Route path="scoring-formulas" element={<Formulas />} />
            <Route path="upload" element={<Upload />} />
            <Route path="publishing" element={<Publishing />} />
            <Route path="finalization" element={<Finalization />} />
            <Route path="audit-log" element={<AuditLog />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
