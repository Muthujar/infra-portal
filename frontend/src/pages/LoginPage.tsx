import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// Demo users created by the seed script, so testers can log in with one click.
const DEMO_USERS = [
  { email: "dev@demo.local", label: "Developer (requester)" },
  { email: "lead@demo.local", label: "Team lead (approver)" },
  { email: "admin@demo.local", label: "DevOps admin" },
];
const DEMO_PASSWORD = "Password@123";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError("");
    setBusy(true);
    try {
      await login(loginEmail, loginPassword);
      navigate("/catalog");
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    doLogin(email, password);
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1>Infra Portal</h1>
        <p className="muted">Self-service servers on Proxmox and AWS</p>

        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </button>

        <div className="demo-users">
          <p className="muted">Demo users (password {DEMO_PASSWORD}):</p>
          {DEMO_USERS.map((demo) => (
            <button
              type="button"
              className="secondary"
              key={demo.email}
              disabled={busy}
              onClick={() => doLogin(demo.email, DEMO_PASSWORD)}
            >
              {demo.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
