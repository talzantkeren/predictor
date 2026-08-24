export function FormMessage({
  kind,
  children,
}: {
  kind: "success" | "error" | "info";
  children: React.ReactNode;
}) {
  const colors = {
    success: "border-success-200 bg-success-50 text-success-900",
    error: "border-error-200 bg-error-50 text-error-900",
    info: "border-navy-200 bg-navy-100 text-navy-900",
  }[kind];

  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`mb-5 rounded-lg border px-3 py-2 text-sm leading-6 ${colors}`}
    >
      {children}
    </p>
  );
}

export function FieldError({
  id,
  messages,
  alert = false,
}: {
  id: string;
  messages?: string[];
  // Field-level errors are announced through aria-describedby on their input.
  // Section-level errors have no owning input, so they announce as an alert.
  alert?: boolean;
}) {
  if (!messages?.length) {
    return null;
  }

  return (
    <p
      id={id}
      role={alert ? "alert" : undefined}
      className="mt-1 text-sm text-error-900"
    >
      {messages[0]}
    </p>
  );
}
