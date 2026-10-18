import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/riders/me
 *
 * Returns the signed-in rider's full profile (User row +
 * RiderProfile + default payment account). Mirrors what the auth
 * `/api/auth/login` response returns, but adds the rider-only
 * columns the dashboard / settings page read on mount:
 *
 *   • `isOnline` — the rider's toggle state, so the dashboard
 *     renders the correct toggle position after page refresh
 *     (no longer relies on React state alone).
 *   • `vehicleType`, `vehicleRegNumber`
 *   • `zone` — the rider's service zone (lat, lng, radiusKm,
 *     address); null when not yet picked. The dashboard reads
 *     this to decide whether to show the blocking zone modal.
 *   • `hasVehicle` / `hasPaymentDetails` — used by the earnings
 *     page to disable the Cash-Out bar.
 *   • `defaultAccount` — the rider's first payout account, used
 *     to pre-select on the WithdrawBar.
 *
 *   200 { rider: { id, name, email, phone, isOnline,
 *                   vehicleType, vehicleRegNumber,
 *                   hasVehicle, hasPaymentDetails,
 *                   zone: { lat, lng, radiusKm, address } | null,
 *                   defaultAccount: { id, label, method, destination,
 *                                     accountHolder } | null } }
 *   401 missing / invalid token
 *   403 wrong role
 *   500 server error
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        profileNeedsReentry: true,
        riderProfile: {
          select: {
            isOnline: true,
            vehicleType: true,
            vehicleRegNumber: true,
            vehicleNeedsReentry: true,
            zoneLat: true,
            zoneLng: true,
            zoneRadiusKm: true,
            zoneAddress: true,
            // ধাপ ৫ — Admin verification gate. The dashboard reads
            // this to decide whether to disable the online toggle
            // and surface a banner.
            verificationStatus: true,
            rejectionReason: true,
            // Notification preferences — surfaced to /rider/settings
            // (the three toggles) and consumed by the dispatch +
            // payout routes so the platform respects them. Defaults
            // are baked into the schema (true/true/false).
            notifyNewRequest: true,
            notifyPayout: true,
            notifyWeeklySummary: true,
            paymentAccounts: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                label: true,
                method: true,
                destination: true,
                accountHolder: true,
                isDefault: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      return NextResponse.json(
        { error: "User no longer exists" },
        { status: 401 },
      );
    }
    const profile = user.riderProfile;
    const accounts = profile?.paymentAccounts ?? [];
    const defaultAccount =
      accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;
    const hasZone =
      profile !== null &&
      profile.zoneLat !== null &&
      profile.zoneLng !== null;

    return NextResponse.json(
      {
        rider: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          // Profile-change request flags. The Settings page reads
          // these to decide whether the Profile / Vehicle sections
          // are editable + whether to show a "request pending" badge.
          profileNeedsReentry: user.profileNeedsReentry,
          isOnline: profile?.isOnline ?? false,
          vehicleType: profile?.vehicleType ?? "",
          vehicleRegNumber: profile?.vehicleRegNumber ?? "",
          vehicleNeedsReentry: profile?.vehicleNeedsReentry ?? false,
          hasVehicle: !!profile?.vehicleType || !!profile?.vehicleRegNumber,
          // ধাপ ৫ — forwarded so the rider dashboard can render
          // the right banner / disable the online toggle.
          verificationStatus: profile?.verificationStatus ?? "PENDING",
          rejectionReason: profile?.rejectionReason ?? null,
          hasPaymentDetails: accounts.length > 0,
          zone: hasZone
            ? {
                lat: profile!.zoneLat,
                lng: profile!.zoneLng,
                radiusKm: profile!.zoneRadiusKm ?? 5,
                address: profile!.zoneAddress ?? "",
              }
            : null,
          // Notification preferences — the Settings page binds three
          // toggles to these. The dispatch + payout routes also read
          // them to decide whether to write a bell row.
          notifyNewRequest: profile?.notifyNewRequest ?? true,
          notifyPayout: profile?.notifyPayout ?? true,
          notifyWeeklySummary: profile?.notifyWeeklySummary ?? false,
          defaultAccount: defaultAccount
            ? {
                id: defaultAccount.id,
                label: defaultAccount.label,
                method: defaultAccount.method,
                destination: defaultAccount.destination,
                accountHolder: defaultAccount.accountHolder,
              }
            : null,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("riders/me failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load rider profile",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/riders/me
 *
 * Update the rider's locked profile / vehicle fields after an admin
 * approved a ProfileChangeRequest. Body shape (all optional, must
 * include at least one):
 *
 *   {
 *     name?: string,
 *     email?: string,
 *     phone?: string | null,
 *     vehicleType?: string,
 *     vehicleRegNumber?: string
 *   }
 *
 * The matching "needs re-entry" flag MUST be true on the relevant
 * record, otherwise the field is read-only and the request is
 * rejected with 403. On success, both flags clear automatically so
 * the next round goes back to read-only.
 *
 * Auth: RIDER only.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const v = (body ?? {}) as Record<string, unknown>;

  const profileKeys = ["name", "email", "phone"] as const;
  const vehicleKeys = ["vehicleType", "vehicleRegNumber"] as const;

  const hasProfile = profileKeys.some((k) => v[k] !== undefined);
  const hasVehicle = vehicleKeys.some((k) => v[k] !== undefined);
  if (!hasProfile && !hasVehicle) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        profileNeedsReentry: true,
        riderProfile: {
          select: { id: true, vehicleNeedsReentry: true },
        },
      },
    });
    if (!user) {
      return NextResponse.json(
        { error: "User no longer exists" },
        { status: 401 },
      );
    }
    const profileId = user.riderProfile?.id;
    if (!profileId) {
      return NextResponse.json(
        { error: "Rider profile missing" },
        { status: 400 },
      );
    }

    // Field-level validation + flag checks.
    const userData: {
      name?: string;
      email?: string;
      phone?: string | null;
      profileNeedsReentry?: boolean;
    } = {};
    if (hasProfile) {
      if (!user.profileNeedsReentry) {
        return NextResponse.json(
          {
            error:
              "Profile fields are locked. Submit a profile-change request first.",
          },
          { status: 403 },
        );
      }
      if (v.name !== undefined) {
        const name = String(v.name).trim();
        if (name.length < 2) {
          return NextResponse.json(
            { error: "Name must be at least 2 characters" },
            { status: 400 },
          );
        }
        userData.name = name;
      }
      if (v.email !== undefined) {
        const email = String(v.email).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return NextResponse.json(
            { error: "Enter a valid email address" },
            { status: 400 },
          );
        }
        userData.email = email;
      }
      if (v.phone !== undefined) {
        const raw = v.phone === null ? null : String(v.phone).trim();
        if (
          raw !== null &&
          raw.length > 0 &&
          !/^[+\d][\d\s-]{9,}$/.test(raw)
        ) {
          return NextResponse.json(
            { error: "Enter a valid phone number" },
            { status: 400 },
          );
        }
        userData.phone = raw;
      }
    }

    const riderProfileData: {
      vehicleType?: string;
      vehicleRegNumber?: string;
      vehicleNeedsReentry?: boolean;
    } = {};
    if (hasVehicle) {
      if (!user.riderProfile?.vehicleNeedsReentry) {
        return NextResponse.json(
          {
            error:
              "Vehicle fields are locked. Submit a vehicle-change request first.",
          },
          { status: 403 },
        );
      }
      if (v.vehicleType !== undefined) {
        const vt = String(v.vehicleType).trim();
        if (vt.length < 1) {
          return NextResponse.json(
            { error: "Vehicle type is required" },
            { status: 400 },
          );
        }
        riderProfileData.vehicleType = vt;
      }
      if (v.vehicleRegNumber !== undefined) {
        const reg = String(v.vehicleRegNumber).trim();
        if (reg.length < 4) {
          return NextResponse.json(
            { error: "Enter a valid registration number" },
            { status: 400 },
          );
        }
        riderProfileData.vehicleRegNumber = reg;
      }
    }

    // Clear the flags so the page goes back to read-only.
    if (hasProfile) userData.profileNeedsReentry = false;
    if (hasVehicle) riderProfileData.vehicleNeedsReentry = false;

    type UpdatedUser = {
      name: string;
      email: string;
      phone: string | null;
      profileNeedsReentry: boolean;
    };
    type UpdatedProfile = {
      vehicleType: string | null;
      vehicleRegNumber: string | null;
      vehicleNeedsReentry: boolean;
    };
    const updated = await prisma.$transaction(async (tx) => {
      const u = Object.keys(userData).length > 0
        ? await tx.user.update({
            where: { id: auth.user.id },
            data: userData,
            select: {
              name: true,
              email: true,
              phone: true,
              profileNeedsReentry: true,
            },
          })
        : null;
      const p = Object.keys(riderProfileData).length > 0
        ? await tx.riderProfile.update({
            where: { id: profileId },
            data: riderProfileData,
            select: {
              vehicleType: true,
              vehicleRegNumber: true,
              vehicleNeedsReentry: true,
            },
          })
        : null;
      return { u: u as UpdatedUser | null, p: p as UpdatedProfile | null };
    });
    const updatedUser = updated.u;
    const updatedProfile = updated.p;

    return NextResponse.json(
      {
        user: updatedUser ?? null,
        riderProfile: updatedProfile ?? null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("riders/me PATCH failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update rider profile",
      },
      { status: 500 },
    );
  }
}
