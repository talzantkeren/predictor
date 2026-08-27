import type { ManualMatchFieldErrors } from "@/features/scoring/schemas";

export type ManualMatchActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  resultVersion?: number;
  fieldErrors?: ManualMatchFieldErrors;
};

export type ManualMatchFormAction = (
  previousState: ManualMatchActionState,
  formData: FormData,
) => Promise<ManualMatchActionState>;
