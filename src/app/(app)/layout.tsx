import { AppHeader } from "@/features/auth/components/app-header";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-ink">
      <AppHeader />
      <div id="main-content" tabIndex={-1} className="outline-none">
        {children}
      </div>
    </div>
  );
}
