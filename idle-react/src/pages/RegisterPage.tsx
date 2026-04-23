import type { ReactNode } from "react";
import { isValidEmail, isValidPassword } from "@maxidle/shared/authValidation";
import type { AuthFormState } from "../app/types";
import { SharedAuthPage } from "./LoginPage";

type RegisterPageProps = {
  authPending: boolean;
  registerForm: AuthFormState;
  onRegisterFormChange: (field: "email" | "password", value: string) => void;
  onRegister: () => Promise<void>;
  onNavigateLogin: () => void;
  renderAuthButtons: () => ReactNode;
};

export function RegisterPage({
  authPending,
  registerForm,
  onRegisterFormChange,
  onRegister,
  onNavigateLogin,
  renderAuthButtons
}: RegisterPageProps) {
  const isRegisterSubmitDisabled = !isValidEmail(registerForm.email) || !isValidPassword(registerForm.password);

  return (
    <SharedAuthPage
      authPending={authPending}
      form={registerForm}
      heading="Create account"
      submitLabel="Create account"
      alternateActionCopy="Already have an account?"
      alternateActionLabel="Back to login"
      alternateActionClassName="link"
      onFormChange={onRegisterFormChange}
      onSubmit={onRegister}
      onAlternateAction={onNavigateLogin}
      isSubmitDisabled={isRegisterSubmitDisabled}
      renderAuthButtons={renderAuthButtons}
    />
  );
}
