import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api";
import { Icon } from "../components/Icon";

// Demo users created by the seed script, so testers can log in with one click.
const DEMO_USERS = [
  { email: "dev@demo.local", label: "Developer", hint: "Requests servers" },
  { email: "lead@demo.local", label: "Team lead", hint: "Approves DEV and QA" },
  { email: "admin@demo.local", label: "DevOps admin", hint: "Approves PROD, manages quotas" },
];
const DEMO_PASSWORD = "Password@123";

const FEATURES = [
  "Pick a server from the catalog",
  "Your team lead approves it",
  "Terraform creates it automatically",
];

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
    document.title = "Log in · Infra Portal";
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
      <section className="login-intro">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="server" size={18} />
          </span>
          Infra Portal
        </div>
        <div>
          <h1>Servers on Proxmox and AWS, without the tickets.</h1>
          <ul>
            {FEATURES.map((feature) => (
              <li key={feature}>
                <Icon name="checkCircle" /> {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="login-main">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Log in</h2>
          <p className="muted">Use your portal or company account.</p>

          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          {ldapOn && <div className="notice notice-info">Company login is on: use your company email and password.</div>}
          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="block" disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </button>

          <div className="demo-users">
            <p className="muted small">
              Try a demo user (password <code>{DEMO_PASSWORD}</code>)
            </p>
            {DEMO_USERS.map((demo) => (
              <button
                type="button"
                className="demo-user"
                key={demo.email}
                disabled={busy}
                onClick={() => doLogin(demo.email, DEMO_PASSWORD)}
              >
                <span>
                  <strong>{demo.label}</strong>
                  <span className="muted small">{demo.hint}</span>
                </span>
                <Icon name="arrowRight" size={16} />
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
