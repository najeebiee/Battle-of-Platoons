import React, { useState } from "react";
import "../styles/pages/login.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Login() {
  const nav = useNavigate();
  const { login, sessionError, clearSessionError } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    clearSessionError();
    try {
      await login(username.trim(), password);
      nav("/dashboard");
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "Login failed. Check email/password.");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-title">Battle of Platoons</div>
        <div className="login-sub">Sign in to continue</div>

        {sessionError && (
          <div className="p-status error" style={{ marginBottom: 10 }}>
            {sessionError}
          </div>
        )}

        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Agent ID or email"
              autoComplete="username"
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className="btn-primary" type="submit">Sign in</button>

          {msg && <div className="p-status error" style={{ marginTop: 10 }}>{msg}</div>}
        </form>
      </div>
    </div>
  );
}
