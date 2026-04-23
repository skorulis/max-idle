import type { ReactNode } from "react";
import { isValidEmail, isValidPassword } from "@maxidle/shared/authValidation";
import type { AuthFormState } from "../app/types";

type SharedAuthPageProps = {
  authPending: boolean;
  form: AuthFormState;
  heading: string;
  headingTag?: "h2" | "h3";
  submitLabel: string;
  alternateActionCopy?: string;
  alternateActionLabel?: string;
  alternateActionClassName?: "secondary" | "link";
  onFormChange: (field: "email" | "password", value: string) => void;
  onSubmit: () => Promise<void>;
  onAlternateAction?: () => void;
  isSubmitDisabled: boolean;
  renderAuthButtons: () => ReactNode;
};

export function SharedAuthPage({
  authPending,
  form,
  heading,
  headingTag = "h2",
  submitLabel,
  alternateActionCopy,
  alternateActionLabel,
  alternateActionClassName,
  onFormChange,
  onSubmit,
  onAlternateAction,
  isSubmitDisabled,
  renderAuthButtons
}: SharedAuthPageProps) {
  const HeadingTag = headingTag;
  const showAlternateAction = Boolean(alternateActionCopy && alternateActionLabel && alternateActionClassName && onAlternateAction);

  return (
    <div className="auth-grid">
      <div>
        <HeadingTag>{heading}</HeadingTag>

        {renderAuthButtons()}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid #e5e7eb" }} />
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>OR</span>
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid #e5e7eb" }} />
        </div>
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(event) => onFormChange("email", event.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(event) => onFormChange("password", event.target.value)}
        />
        <button className="collect" onClick={() => void onSubmit()} disabled={authPending || isSubmitDisabled}>
          {authPending ? "Loading..." : submitLabel}
        </button>
        {showAlternateAction ? (
          <>
            <p className="subtle" style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
              {alternateActionCopy}
            </p>
            <button
              type="button"
              className={alternateActionClassName}
              onClick={onAlternateAction}
              disabled={authPending}
              style={alternateActionClassName === "link" ? { width: "auto", padding: 0 } : undefined}
            >
              {alternateActionLabel}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

type LoginPageProps = {
  authPending: boolean;
  loginForm: AuthFormState;
  onLoginFormChange: (field: "email" | "password", value: string) => void;
  onLogin: () => Promise<void>;
  onNavigateRegister: () => void;
  renderAuthButtons: () => ReactNode;
};

export function LoginPage({
  authPending,
  loginForm,
  onLoginFormChange,
  onLogin,
  onNavigateRegister,
  renderAuthButtons
}: LoginPageProps) {
  const isLoginSubmitDisabled = !isValidEmail(loginForm.email) || !isValidPassword(loginForm.password);

  return (
    <SharedAuthPage
      authPending={authPending}
      form={loginForm}
      heading="Login"
      submitLabel="Login"
      alternateActionCopy="New here?"
      alternateActionLabel="Create account"
      alternateActionClassName="secondary"
      onFormChange={onLoginFormChange}
      onSubmit={onLogin}
      onAlternateAction={onNavigateRegister}
      isSubmitDisabled={isLoginSubmitDisabled}
      renderAuthButtons={renderAuthButtons}
    />
  );
}
