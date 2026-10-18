"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type AuthRole } from "@/components/auth/AuthProvider";

/**
 * Client-side route guard for protected pages.
 *
 * Usage:
 *   <RequireAuth role="PARTNER"><PartnerDashboard /></RequireAuth>
 *
 * Behaviour:
 *   • During the first paint (still hydrating from localStorage) we
 *     render the children but in a hidden state via the
 *     `data-require-auth-hydrating` attribute. We do not redirect
 *     yet so an SSR/CSR mismatch on a real session doesn't bounce
 *     the user out of a page they own.
 *   • Once hydrated: if the user is missing or has the wrong role,
 *     redirect to the matching login page.
 *   • `role` is optional. Pass it to enforce that the role-specific
 *     portal only accepts users with the matching role (so e.g. a
 *     CUSTOMER logging in via /partner/login can't accidentally
 *     land on /partner/dashboard).
 */
export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  /** Optional role guard; if set the user must have this role. */
  role?: AuthRole;
}) {
  const router = useRouter();
  const { user, hydrating } = useAuth();

  useEffect(() => {
    if (hydrating) return;
    if (!user) {
      // Pick the right login page for the protected portal.
      const login =
        role === "PARTNER"
          ? "/partner/login"
          : role === "RIDER"
            ? "/rider/login"
            : role === "ADMIN"
              ? "/admin/login"
              : "/login";
      router.replace(login);
      return;
    }
    if (role && user.role !== role) {
      // Wrong role for this portal — bounce to the user's portal.
      const portal =
        user.role === "PARTNER"
          ? "/partner/dashboard"
          : user.role === "RIDER"
            ? "/rider/dashboard"
            : user.role === "ADMIN"
              ? "/admin/dashboard"
              : "/";
      router.replace(portal);
    }
  }, [hydrating, user, role, router]);

  if (hydrating) {
    return (
      <div
        aria-hidden
        data-require-auth-hydrating="true"
        className="min-h-screen w-full"
      />
    );
  }
  if (!user) return null;
  if (role && user.role !== role) return null;
  return <>{children}</>;
}
