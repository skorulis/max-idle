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
  dailyRewardNotificationsSupported: boolean;
  dailyRewardNotificationsEnabled: boolean;
  dailyRewardNotificationPermission: NotificationPermission | "unsupported";
  dailyRewardNotificationPermissionPending: boolean;
  usernameDraft: string;
  upgradeForm: AuthFormState;
  onUsernameChange: (value: string) => void;
  onSaveUsername: () => Promise<void>;
  onUpgradeFormChange: (field: "name" | "email" | "password", value: string) => void;
  onUpgrade: () => Promise<void>;
  onLogout: () => Promise<void>;
  onToggleDailyRewardNotifications: (enabled: boolean) => Promise<void>;
  onNavigateLogin: () => void;
  renderAuthButtons: () => ReactNode;
};

export function AccountPage({
  account,
  token,
  authPending,
  usernamePending,
  dailyRewardNotificationsSupported,
  dailyRewardNotificationsEnabled,
  dailyRewardNotificationPermission,
  dailyRewardNotificationPermissionPending,
  usernameDraft,
  upgradeForm,
  onUsernameChange,
  onSaveUsername,
  onUpgradeFormChange,
  onUpgrade,
  onLogout,
  onToggleDailyRewardNotifications,
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
      <div className="panel" style={{ marginTop: "0.75rem" }}>
        <h3>Notifications</h3>
        {dailyRewardNotificationsSupported ? (
          <label
            className="subtle"
            style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, width: "100%", textAlign: "left" }}
          >
            <input
              type="checkbox"
              style={{ width: "auto", margin: 0 }}
              checked={dailyRewardNotificationsEnabled}
              disabled={dailyRewardNotificationPermissionPending}
              onChange={(event) => {
                void onToggleDailyRewardNotifications(event.target.checked);
              }}
            />
            Notify me when daily reward is ready
          </label>
        ) : (
          <p className="subtle">Push notifications are not supported on this device.</p>
        )}
        {dailyRewardNotificationPermission === "denied" ? (
          <p className="subtle">Notifications are blocked in browser settings.</p>
        ) : null}
      </div>
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
      ) : null}
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
