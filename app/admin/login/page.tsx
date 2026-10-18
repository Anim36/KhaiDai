import type { Metadata } from "next";
import { AdminAuthLayout } from "@/components/admin/dashboard/AdminAuthLayout";
import { AdminLoginForm } from "@/components/admin/dashboard/AdminLoginForm";

export const metadata: Metadata = {
  title: "Admin Login · KhaiDai",
  description:
    "Sign in to the KhaiDai platform admin console to manage users, restaurants, and orders.",
};

/**
 * /admin/login — admin-only sign-in. Distinct from /login (which
 * serves CUSTOMER accounts) so cross-role auth flows land on the
 * right page. Mid-route serves the same Figma-style two-column
 * shell as the partner login (left = brand panel, right = form).
 */
export default function AdminLoginPage() {
  return (
    <AdminAuthLayout
      formHeader={{
        title: "Welcome back, admin.",
        subtitle:
          "Sign in with the credentials your platform owner created for you. Lost access? Ask another admin to promote a fresh account via scripts/create-admin.mjs.",
      }}
      footerNote="Looking for the customer or partner login?"
    >
      <AdminLoginForm />
    </AdminAuthLayout>
  );
}
