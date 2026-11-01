import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api";
import { Logo } from "../components/Layout";

// Demo users created by the seed script, so testers can log in with one click.
const DEMO_USERS = [
  { email: "dev@demo.local", label: "Developer", note: "Requests servers", initials: "DV" },
  { email: "lead@demo.local", label: "Team lead", note: "Approves DEV and QA", initials: "TL" },
  { email: "admin@demo.local", label: "DevOps admin", note: "Quotas, catalog, PROD", initials: "AD" },
];
const DEMO_PASSWORD = "Password@123";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ldapOn, setLdapOn] = useState(false);

  // Ask the API whether company (LDAP) login is switched on, to show a hint.
  useEffect(() => {
    api<{ ldap: boolean }>("/auth/options")
      .then((options) => setLdapOn(options.ldap))
      .catch(() => setLdapOn(false));
  }, []);

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
      <section className="login-hero">
        <div className="login-brand">
          <Logo />
          <span>Infra Portal</span>
        </div>
        <h2>Servers on Proxmox and AWS, without the ticket queue.</h2>
        <ul>
          <li>Pick a server from the catalog</li>
          <li>Your team lead approves it</li>
          <li>Terraform creates it, AWX sets it up</li>
          <li>Quotas, leases and a full audit trail</li>
        </ul>
      </section>

      <section className="login-side">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1>Sign in</h1>
          <p className="muted">Use your work email and password.</p>

          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="you@company.com" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
          </label>

          {ldapOn && <p className="info">Company login is on: use your company email and password.</p>}

          {error && <div className="error">{error}</div>}

          <button type="submit" className="block" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>

          <div className="divider">
            <span>or try a demo user</span>
          </div>
          <div className="demo-users">
            {DEMO_USERS.map((demo) => (
              <button
                type="button"
                className="demo-user"
                key={demo.email}
                disabled={busy}
                onClick={() => doLogin(demo.email, DEMO_PASSWORD)}
              >
                <span className="avatar" aria-hidden="true">
                  {demo.initials}
                </span>
                <span className="demo-text">
                  <strong>{demo.label}</strong>
                  <span className="muted small">{demo.note}</span>
                </span>
                <span className="demo-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
            <p className="muted small">All demo users use the password {DEMO_PASSWORD}.</p>
          </div>
        </form>
      </section>
    </div>
  );
}
