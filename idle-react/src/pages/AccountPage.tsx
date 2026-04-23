import type { ReactNode } from "react";
import { APP_VERSION } from "@maxidle/shared/appVersion";
import { isValidEmail, isValidPassword } from "@maxidle/shared/authValidation";
import type { AccountResponse, AuthFormState } from "../app/types";
import { SharedAuthPage } from "./LoginPage";

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
  const isUpgradeSubmitDisabled = !token || !isValidEmail(upgradeForm.email) || !isValidPassword(upgradeForm.password);

  if (!account) {
    return (
      <>
        <h2>Account</h2>
        <p>No active account session.</p>
        <button className="secondary" onClick={onNavigateLogin}>
          Go to login
        </button>
        <p className="subtle">Version {APP_VERSION}</p>
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
        disabled={usernamePending}
      />
      <button
        className="collect"
        onClick={() => void onSaveUsername()}
        disabled={usernamePending || authPending || usernameDraft.trim().length === 0 || usernameDraft.trim() === account.username}
      >
        {usernamePending ? "Saving..." : "Save username"}
      </button>
      {usernameError ? <p className="error">{usernameError}</p> : null}
      {usernameSuccess ? <p className="success">{usernameSuccess}</p> : null}
      {account.isAnonymous ? (
        <>
          <div className="panel" style={{ marginTop: "0.75rem" }}>
            <SharedAuthPage
              authPending={authPending}
              form={upgradeForm}
              heading="Upgrade to a registered account"
              headingTag="h3"
              submitLabel="Create account"
              onFormChange={(field, value) => onUpgradeFormChange(field, value)}
              onSubmit={onUpgrade}
              isSubmitDisabled={isUpgradeSubmitDisabled}
              renderAuthButtons={renderAuthButtons}
            />
          </div>
        </>
      ) : (
        <>
          {renderAuthButtons()}
        </>
      )}
      <button type="button" className="secondary" onClick={() => void onLogout()} disabled={authPending}>
        {authPending ? "Logging out..." : "Logout"}
      </button>
      {account.isAnonymous ? (
        <p className="warning-alert">
          Warning: logging out of an anonymous account permanently loses progress and cannot be recovered.
        </p>
      ) : null}
      <p className="subtle">Version {APP_VERSION}</p>
    </>
  );
}
