import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "../gameToast";
import { authClient } from "./authClient";
import { loginWithEmail, logoutSession, registerWithEmail, updateUsername, upgradeAnonymous } from "./api";
import type { AccountResponse, AuthFormState } from "./types";

type UseAppAuthActionsParams = {
  token: string | null;
  setToken: (value: string | null) => void;
  setPlayerState: (value: null) => void;
  setTournamentState: (value: null) => void;
  setAccount: (value: AccountResponse | null) => void;
  setStatus: (message: string) => void;
  setError: (message: string | null) => void;
  refreshHome: (token: string | null) => Promise<void>;
  refreshAccount: (token: string | null) => Promise<void>;
  account: AccountResponse | null;
  usernameDraft: string;
  setUsernameDraft: (value: string) => void;
  clearRouteDataOnLogout: () => void;
  onStartIdling: () => Promise<void>;
  tokenStorageKey: string;
  upgradeSocialIntentKey: string;
};

export function useAppAuthActions({
  token,
  setToken,
  setPlayerState,
  setTournamentState,
  setAccount,
  setStatus,
  setError,
  refreshHome,
  refreshAccount,
  account,
  usernameDraft,
  setUsernameDraft,
  clearRouteDataOnLogout,
  onStartIdling,
  tokenStorageKey,
  upgradeSocialIntentKey
}: UseAppAuthActionsParams) {
  const navigate = useNavigate();
  const [authPending, setAuthPending] = useState(false);
  const [usernamePending, setUsernamePending] = useState(false);

  const onStartJourneyFromLeaderboard = async () => {
    await onStartIdling();
    if (localStorage.getItem(tokenStorageKey)) {
      navigate("/");
    }
  };

  const onLogin = async (loginForm: AuthFormState) => {
    setAuthPending(true);
    setError(null);
    setStatus("Logging in...");
    try {
      await loginWithEmail(loginForm.email, loginForm.password);
      localStorage.removeItem(tokenStorageKey);
      setToken(null);
      await refreshHome(null);
      setStatus("Welcome back. Nothing waits for you.");
      navigate("/");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
      setStatus("Could not log in.");
    } finally {
      setAuthPending(false);
    }
  };

  const onRegister = async (signupForm: AuthFormState) => {
    setAuthPending(true);
    setError(null);
    setStatus("Creating account...");
    try {
      await registerWithEmail(signupForm.email, signupForm.password);
      localStorage.removeItem(tokenStorageKey);
      setToken(null);
      await refreshHome(null);
      setStatus("Account created. Continue doing nothing.");
      navigate("/");
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Registration failed");
      setStatus("Could not create account.");
    } finally {
      setAuthPending(false);
    }
  };

  const onGoogleLogin = async () => {
    setAuthPending(true);
    setError(null);
    setStatus("Redirecting to Google...");
    try {
      const frontendOrigin = window.location.origin;
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${frontendOrigin}/`,
        errorCallbackURL: `${frontendOrigin}/login`
      });
    } catch (socialLoginError) {
      setError(socialLoginError instanceof Error ? socialLoginError.message : "Google sign-in failed");
      setStatus("Could not start Google sign-in.");
      setAuthPending(false);
    }
  };

  const onGoogleUpgrade = async () => {
    if (!token) {
      return;
    }
    setAuthPending(true);
    setError(null);
    setStatus("Redirecting to Google...");
    try {
      const frontendOrigin = window.location.origin;
      sessionStorage.setItem(upgradeSocialIntentKey, "google");
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${frontendOrigin}/account?upgradeSocial=google`,
        errorCallbackURL: `${frontendOrigin}/account?upgradeSocial=error`
      });
    } catch (socialLoginError) {
      sessionStorage.removeItem(upgradeSocialIntentKey);
      setError(socialLoginError instanceof Error ? socialLoginError.message : "Google sign-in failed");
      setStatus("Could not start Google sign-in.");
      setAuthPending(false);
    }
  };

  const onUpgrade = async (upgradeForm: AuthFormState) => {
    if (!token) {
      return;
    }
    setAuthPending(true);
    setError(null);
    setStatus("Upgrading anonymous account...");
    try {
      await upgradeAnonymous(token, upgradeForm.name, upgradeForm.email, upgradeForm.password);
      localStorage.removeItem(tokenStorageKey);
      setToken(null);
      await refreshHome(null);
      setStatus("Anonymous account upgraded.");
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : "Upgrade failed");
      setStatus("Could not upgrade account.");
    } finally {
      setAuthPending(false);
    }
  };

  const onLogout = async () => {
    setAuthPending(true);
    setError(null);
    try {
      await logoutSession();
    } catch {
      // Ignore logout failures; local state reset still proceeds.
    } finally {
      localStorage.removeItem(tokenStorageKey);
      setToken(null);
      setPlayerState(null);
      setTournamentState(null);
      setAccount(null);
      clearRouteDataOnLogout();
      setStatus("Press start when you are ready to do nothing.");
      setAuthPending(false);
      navigate("/");
    }
  };

  const onUsernameChange = (value: string) => {
    setUsernameDraft(value);
  };

  const onSaveUsername = async () => {
    if (!account) {
      return;
    }
    const nextUsername = usernameDraft.trim();
    if (!nextUsername || nextUsername === account.username) {
      return;
    }
    setUsernamePending(true);
    try {
      await updateUsername(token, nextUsername);
      await refreshAccount(token);
      toast.success("Username updated successfully.");
    } catch (usernameUpdateError) {
      if (usernameUpdateError instanceof Error && usernameUpdateError.message === "USERNAME_TAKEN") {
        toast.error("That username is already taken.");
      } else {
        toast.error(usernameUpdateError instanceof Error ? usernameUpdateError.message : "Could not update username.");
      }
    } finally {
      setUsernamePending(false);
    }
  };

  return {
    authPending,
    setAuthPending,
    usernamePending,
    onStartJourneyFromLeaderboard,
    onLogin,
    onRegister,
    onGoogleLogin,
    onGoogleUpgrade,
    onUpgrade,
    onLogout,
    onUsernameChange,
    onSaveUsername
  };
}
