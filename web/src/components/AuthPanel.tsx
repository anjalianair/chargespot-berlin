import { useEffect, useState, type FormEvent } from "react";
import {
  getCurrentUser,
  loginUser,
  registerUser,
  type User,
} from "../api";

const TOKEN_STORAGE_KEY = "chargespot_access_token";

type AuthMode = "login" | "register";

type AuthPanelProps = {
  onAuthenticationChange: (user: User | null, token: string | null) => void;
};

export default function AuthPanel({
  onAuthenticationChange,
}: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!storedToken) {
        setIsRestoringSession(false);
        onAuthenticationChange(null, null);
        return;
      }

      try {
        const currentUser = await getCurrentUser(storedToken);
        setUser(currentUser);
        onAuthenticationChange(currentUser, storedToken);
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        onAuthenticationChange(null, null);
      } finally {
        setIsRestoringSession(false);
      }
    };

    void restoreSession();
  }, [onAuthenticationChange]);

  const clearForm = () => {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setMessage("");
  };

  const changeMode = (newMode: AuthMode) => {
    setMode(newMode);
    clearForm();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      if (mode === "register") {
        await registerUser({
          display_name: displayName.trim(),
          email: email.trim(),
          password,
        });

        setMode("login");
        setPassword("");
        setMessage("Account created. You can now log in.");
        return;
      }

      const loginResult = await loginUser({
        email: email.trim(),
        password,
      });

      localStorage.setItem(TOKEN_STORAGE_KEY, loginResult.access_token);

      const currentUser = await getCurrentUser(loginResult.access_token);

      setUser(currentUser);
      setPassword("");
      setMessage("");
      onAuthenticationChange(currentUser, loginResult.access_token);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    clearForm();
    onAuthenticationChange(null, null);
  };

  if (isRestoringSession) {
    return (
      <section className="auth-panel">
        <p className="section-label">USER ACCOUNT</p>
        <p>Checking saved login…</p>
      </section>
    );
  }

  if (user) {
    return (
      <section className="auth-panel">
        <p className="section-label">USER ACCOUNT</p>
        <h3>Welcome, {user.display_name}</h3>
        <p className="auth-email">{user.email}</p>
        <p className="auth-help">
          You can save and manage candidate charging locations.
        </p>

        <button
          className="secondary-button"
          type="button"
          onClick={handleLogout}
        >
          Log out
        </button>
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <p className="section-label">USER ACCOUNT</p>

      <div className="auth-tabs">
        <button
          type="button"
          className={mode === "login" ? "auth-tab active" : "auth-tab"}
          onClick={() => changeMode("login")}
        >
          Log in
        </button>

        <button
          type="button"
          className={mode === "register" ? "auth-tab active" : "auth-tab"}
          onClick={() => changeMode("register")}
        >
          Register
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "register" && (
          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={8}
            required
          />
        </label>

        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Please wait…"
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </button>
      </form>

      {message && <p className="auth-message">{message}</p>}
    </section>
  );
}
