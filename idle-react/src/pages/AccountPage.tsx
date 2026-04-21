import type { ReactNode } from "react";
import type { AccountResponse, AuthFormState } from "../app/types";

type AccountPageProps = {
  account: AccountResponse | null;
  token: string | null;
  authPending: boolean;
  usernamePending: boolean;
  usernameDraft: string;
  usernameError: string | null;
  usernameSuccess: string | null;
  upgradeForm: AuthFormState;
  onUsernameChange: (value: string) => void;
  onSaveUsername: () => Promise<void>;
  onUpgradeFormChange: (field: "name" | "email" | "password", value: string) => void;
  onUpgrade: () => Promise<void>;
  onLogout: () => Promise<void>;
  onNavigateLogin: () => void;
  renderAuthButtons: () => ReactNode;
};

export function AccountPage({
  account,
  token,
  authPending,
  usernamePending,
  usernameDraft,
  usernameError,
  usernameSuccess,
  upgradeForm,
  onUsernameChange,
  onSaveUsername,
  onUpgradeFormChange,
  onUpgrade,
  onLogout,
  onNavigateLogin,
  renderAuthButtons
}: AccountPageProps) {
  if (!account) {
    return (
      <>
        <h2>Account</h2>
        <p>No active account session.</p>
        <button className="secondary" onClick={onNavigateLogin}>
          Go to login
        </button>
      </>
    );
  }

  return (
    <>
      <h2>Account</h2>
      {account.email ? (
        <p>
          <span>Email:</span> {account.email}
        </p>
      ) : null}
      <h3>Username</h3>
      <input
        type="text"
        placeholder="Username"
        value={usernameDraft}
        onChange={(event) => onUsernameChange(event.target.value)}
        disabled={account.isAnonymous || usernamePending}
      />
      {account.isAnonymous ? (
        <p className="subtle">Anonymous users cannot change username.</p>
      ) : (
        <button
          className="collect"
          onClick={() => void onSaveUsername()}
          disabled={usernamePending || authPending || usernameDraft.trim().length === 0 || usernameDraft.trim() === account.username}
        >
          {usernamePending ? "Saving..." : "Save username"}
        </button>
      )}
      {usernameError ? <p className="error">{usernameError}</p> : null}
      {usernameSuccess ? <p className="success">{usernameSuccess}</p> : null}
      {account.isAnonymous ? (
        <>
          <h3>Upgrade to a registered account</h3>
          <input
            type="email"
            placeholder="Email"
            value={upgradeForm.email}
            onChange={(event) => onUpgradeFormChange("email", event.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={upgradeForm.password}
            onChange={(event) => onUpgradeFormChange("password", event.target.value)}
          />
          <button className="collect" onClick={() => void onUpgrade()} disabled={authPending || !token}>
            {authPending ? "Upgrading..." : "Create account"}
          </button>
        </>
      ) : (
        <>
          <p className="subtle">Google configured: {account.socialProviders.googleEnabled ? "Yes" : "No"}</p>
          <p className="subtle">Apple configured: {account.socialProviders.appleEnabled ? "Yes" : "No"}</p>
          {renderAuthButtons()}
        </>
      )}
      {account.isAnonymous ? (
        <p className="warning-alert">
          Warning: logging out of an anonymous account permanently loses progress and cannot be recovered.
        </p>
      ) : null}
      <button type="button" className="secondary" onClick={() => void onLogout()} disabled={authPending}>
        {authPending ? "Logging out..." : "Logout"}
      </button>
    </>
  );
}
