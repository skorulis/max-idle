import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { APP_VERSION } from "@maxidle/shared/appVersion";
import { isValidEmail, isValidPassword } from "@maxidle/shared/authValidation";
import type { AccountResponse, AuthFormState } from "../app/types";
import { PlayerLevelBadge } from "../components/PlayerLevelBadge";
import { SharedAuthPage } from "./LoginPage";

type AccountPageProps = {
  playerLevel: number;
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
  onSaveUsername: () => Promise<boolean>;
  onUpgradeFormChange: (field: "name" | "email" | "password", value: string) => void;
  onUpgrade: () => Promise<void>;
  onLogout: () => Promise<void>;
  onToggleDailyRewardNotifications: (enabled: boolean) => Promise<void>;
  onNavigateLogin: () => void;
  renderAuthButtons: () => ReactNode;
};

export function AccountPage({
  playerLevel,
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
  const [editingUsername, setEditingUsername] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const isUpgradeSubmitDisabled = !token || !isValidEmail(upgradeForm.email) || !isValidPassword(upgradeForm.password);

  useEffect(() => {
    if (editingUsername) {
      usernameInputRef.current?.focus();
    }
  }, [editingUsername]);

  if (!account) {
    return (
      <section className="card">
        <h2>Account</h2>
        <p>No active account session.</p>
        <button className="secondary" onClick={onNavigateLogin}>
          Go to login
        </button>
        <p className="subtle">Version {APP_VERSION}</p>
      </section>
    );
  }

  const displayedUsername = account.username?.trim() ? account.username : "Player";

  return (
    <section className="card">
      <div className="player-page-heading">
        <PlayerLevelBadge level={playerLevel} size={36} />
        {editingUsername ? (
          <input
            ref={usernameInputRef}
            type="text"
            placeholder="Username"
            value={usernameDraft}
            onChange={(event) => onUsernameChange(event.target.value)}
            disabled={usernamePending}
            className="player-page-heading__title"
            style={{ margin: 0, flex: 1, minWidth: 0, width: "100%", fontSize: 20, fontWeight: 600 }}
          />
        ) : (
          <h2 className="player-page-heading__title">{displayedUsername}</h2>
        )}
        {editingUsername ? (
          <div className="account-username-actions">
            <button
              type="button"
              className="collect"
              disabled={usernamePending || authPending || usernameDraft.trim().length === 0}
              onClick={() => {
                void (async () => {
                  const saved = await onSaveUsername();
                  if (saved) {
                    setEditingUsername(false);
                  }
                })();
              }}
            >
              {usernamePending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={usernamePending || authPending}
              onClick={() => {
                onUsernameChange(account.username ?? "");
                setEditingUsername(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="info-icon-button"
            style={{ flexShrink: 0 }}
            aria-label="Edit username"
            title="Edit username"
            disabled={authPending || usernamePending}
            onClick={() => setEditingUsername(true)}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {account.email ? (
        <p>
          <span>Email:</span> {account.email}
        </p>
      ) : null}
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
              embedded
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
    </section>
  );
}
