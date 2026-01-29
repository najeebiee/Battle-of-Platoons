import React, { useState } from "react";
import "./login.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    try {
      await login(email.trim(), password);
      nav("/dashboard");
    } catch (err) {
      console.error(err);
      setMsg("Login failed. Check email/password.");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-title">Battle of Platoons</div>
        <div className="login-sub">Admin Login</div>

        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <button className="btn-primary" type="submit">Sign in</button>

          {msg && <div className="p-status error" style={{ marginTop: 10 }}>{msg}</div>}
        </form>
      </div>
    </div>
  );
}
