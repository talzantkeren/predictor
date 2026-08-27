export type ManualOverrideClearActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  resultVersion?: number;
  cleared?: boolean;
  confirmationError?: string;
};

export type ManualOverrideClearFormAction = (
  previousState: ManualOverrideClearActionState,
  formData: FormData,
) => Promise<ManualOverrideClearActionState>;
