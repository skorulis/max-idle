import type { ReactNode } from "react";
import type { AuthFormState } from "../app/types";

type LoginPageProps = {
  authPending: boolean;
  loginForm: AuthFormState;
  signupForm: AuthFormState;
  onLoginFormChange: (field: "email" | "password", value: string) => void;
  onSignupFormChange: (field: "email" | "password", value: string) => void;
  onLogin: () => Promise<void>;
  onRegister: () => Promise<void>;
  renderAuthButtons: () => ReactNode;
};

export function LoginPage({
  authPending,
  loginForm,
  signupForm,
  onLoginFormChange,
  onSignupFormChange,
  onLogin,
  onRegister,
  renderAuthButtons
}: LoginPageProps) {
  return (
    <div className="auth-grid">
      <div>
        <h2>Login</h2>

        {renderAuthButtons()}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid #e5e7eb" }} />
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>OR</span>
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid #e5e7eb" }} />
        </div>
        <input
          type="email"
          placeholder="Email"
          value={loginForm.email}
          onChange={(event) => onLoginFormChange("email", event.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={loginForm.password}
          onChange={(event) => onLoginFormChange("password", event.target.value)}
        />
        <button className="collect" onClick={() => void onLogin()} disabled={authPending}>
          {authPending ? "Loading..." : "Login"}
        </button>
        
      </div>

      <div>
        <h2>Create account</h2>
        <input
          type="email"
          placeholder="Email"
          value={signupForm.email}
          onChange={(event) => onSignupFormChange("email", event.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={signupForm.password}
          onChange={(event) => onSignupFormChange("password", event.target.value)}
        />
        <button className="collect" onClick={() => void onRegister()} disabled={authPending}>
          {authPending ? "Loading..." : "Create account"}
        </button>
      </div>
    </div>
  );
}
