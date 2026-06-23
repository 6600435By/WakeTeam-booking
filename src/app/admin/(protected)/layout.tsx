import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-3 py-4 pb-24 sm:px-4 sm:py-6 md:pb-8 md:py-8">
      <AdminNav />
      {children}
    </div>
  );
}
