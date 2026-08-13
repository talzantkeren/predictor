import { AppHeader } from "@/features/auth/components/app-header";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader />
      {children}
    </div>
  );
}
