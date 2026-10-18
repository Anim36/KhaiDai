"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * KhaiDai auth context, backed by the real API at /api/auth.
 *
 * Storage shape (`localStorage["khaidai.auth.v2"]`):
 *   { token, user: { id, name, email, role } }
 *
 * The user object is normalised so the existing navbar pill
 * keeps working (it reads `user.name`), while route guards and
 * API calls can reach for `user.id`, `user.role`, and the
 * bearer token.
 *
 * On mount we hydrate from localStorage so a hard refresh
 * doesn't kick the user back to the login page. Any malformed
 * stored value is cleared, leaving the user in the "guest"
 * state instead of throwing.
 */

export type AuthRole = "CUSTOMER" | "PARTNER" | "RIDER" | "ADMIN";

export type AuthUser = {
  /** Prisma User.id (cuid). */
  id: string;
  /** Display name shown in the navbar pill. */
  name: string;
  /** Email used at sign-up / sign-in. */
  email: string;
  /** Phone collected at registration. Optional — many users
   *  skip it, and the API returns `null` in that case. */
  phone: string | null;
  /** Which dashboard the user can access. */
  role: AuthRole;
};

export type AuthState = {
  user: AuthUser | null;
  /** `true` until the first effect runs (avoids an SSR/CSR flicker). */
  hydrating: boolean;
};

export type LoginInput = {
  email: string;
  password: string;
  /**
   * Optional role gate. When set, the server refuses to issue a JWT
   * unless the account's role matches. Used by the per-portal
   * login forms (/partner/login → "PARTNER", /rider/login →
   * "RIDER", /admin/login → "ADMIN") so a CUSTOMER account can't
   * be used to log in through the partner/rider/admin forms.
   */
  expectedRole?: AuthRole;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: AuthRole;
  // ধাপ ২ — OTP verification code the user typed at the form.
  // Required for all three roles because the server validates it
  // before creating any account row.
  otp: string;
  // Feat 6 — optional referral code (6-character). The customer
  // sign-up form pre-fills this from `?ref=…` in the URL and the
  // server stamps the new user's `referredByUserId` + opens a
  // `Referral` row in PENDING. Ignored for partner / rider roles
  // (the partner/rider signup routes don't read it).
  referralCode?: string;
  // Rider-only — accepted (and persisted on the User row) when
  // `role === "RIDER"`. Optional everywhere else; ignored by the
  // server if a customer/partner sends them.
  vehicleType?: "bike" | "bicycle" | "car";
  vehicleRegNumber?: string;
  // Partner-only — the new restaurant's basic profile (name,
  // address, cuisine). When supplied to a PARTNER signup, the server
  // creates a `Restaurant` row (verificationStatus: PENDING) tied
  // to the new PartnerProfile.
  //
  // Bug fix — optional `latitude` / `longitude` carry the picked
  // pin from the registration form's AddressPicker. The picker
  // is the only source of these (no free-text fallback). When the
  // partner included the restaurant block, the server expects the
  // pin and refuses to create the Restaurant row without it.
  restaurant?: {
    name: string;
    address: string;
    cuisine: string;
    latitude?: number;
    longitude?: number;
  };
  // Partner/Rider — documents uploaded at registration (trade
  // license, owner NID, food safety cert for partners; NID,
  // driving license, vehicle registration for riders). Each
  // row's `fileUrl` is a base64 data URL the admin verification
  // queue can render inline. Server creates `RestaurantDocument`
  // or `RiderDocument` rows tied to the new account based on
  // `role`.
  documents?: Array<{
    documentType:
      | "TRADE_LICENSE"
      | "OWNER_NID"
      | "FOOD_SAFETY_CERT"
      | "OTHER"
      | "NID"
      | "DRIVING_LICENSE"
      | "VEHICLE_REGISTRATION";
    fileName: string;
    fileUrl: string;
    mime: string;
    size: number;
  }>;
  // Rider-only — service zone picked during the registration
  // flow. Server persists it on the freshly-created
  // RiderProfile (zoneLat / zoneLng / zoneRadiusKm /
  // zoneAddress) in the same transaction so the rider doesn't
  // have to make a separate authenticated PUT after the
  // account is created.
  zone?: {
    lat: number;
    lng: number;
    address: string;
    radiusKm?: number;
  };
};

export type AuthContextValue = {
  user: AuthUser | null;
  isLoggedIn: boolean;
  /** JWT bearer; `null` when logged out. */
  token: string | null;
  /** True until the first localStorage read completes. */
  hydrating: boolean;

  /** POST /api/auth/login -> saves token + user, returns user. */
  login: (input: LoginInput) => Promise<AuthUser>;
  /** POST /api/auth/register -> saves token + user, returns user. */
  register: (input: RegisterInput) => Promise<AuthUser>;
  /**
   * Replace the in-memory + localStorage user record without
   * re-issuing a token. Used by the profile "Save changes" flow
   * after PATCH /api/users/me so the navbar pill immediately
   * reflects the freshly-saved name.
   */
  setUser: (user: AuthUser | null) => void;
  /** Clears storage + state. */
  logout: () => void;
};

/* -------------------------------------------------------------------------- */
/*  Storage helpers                                                           */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "khaidai.auth.v2";

/** Same-origin cookie used by Edge middleware to know the role.
 *  We deliberately don't put the JWT here — just the role string —
 *  so the cookie can't be used to forge API calls from a tampered
 *  browser. 24h max-age matches the JWT lifetime we sign on the
 *  server. */
const ROLE_COOKIE = "khaidai_role";

type Stored = { token: string; user: AuthUser };

function readStored(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (
      parsed &&
      typeof parsed.token === "string" &&
      parsed.user &&
      typeof parsed.user.id === "string" &&
      typeof parsed.user.name === "string" &&
      typeof parsed.user.email === "string" &&
      typeof parsed.user.role === "string" &&
      // phone is optional in the API response; accept string | null | undefined
      (parsed.user.phone === null ||
        parsed.user.phone === undefined ||
        typeof parsed.user.phone === "string")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      // Mirror the role into a same-origin cookie so Edge middleware
      // can read it on the very next navigation without a hydration
      // round-trip. Same path everywhere so the cookie is sent on
      // every route.
      document.cookie =
        ROLE_COOKIE +
        "=" +
        encodeURIComponent(value.user.role) +
        "; Path=/; Max-Age=86400; SameSite=Lax";
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
      document.cookie =
        ROLE_COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax";
    }
  } catch {
    /* private mode etc. — ignore. */
  }
}

/* -------------------------------------------------------------------------- */
/*  API helpers                                                               */
/* -------------------------------------------------------------------------- */

export class AuthApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

type AuthResponse = {
  user: AuthUser;
  token: string;
};

async function callAuth(
  path:
    | "/api/auth/login"
    | "/api/auth/register"
    | "/api/auth/register/partner"
    | "/api/auth/register/rider",
  body: unknown,
): Promise<AuthResponse> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: { user?: AuthUser; token?: string; error?: string } | null = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON — leave as null */
    }
  }
  if (!res.ok || !json || !json.user || !json.token) {
    const msg = json?.error ?? `Request failed (${res.status})`;
    throw new AuthApiError(res.status, msg);
  }
  // Normalise: phone comes back as string | null from the API; force
  // the shape to the client's AuthUser type. createdAt is ignored.
  const u = json.user as AuthUser & { phone?: string | null };
  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone ?? null,
      role: u.role,
    },
    token: json.token,
  };
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    hydrating: true,
  });

  useEffect(() => {
    const stored = readStored();
    setState({ user: stored?.user ?? null, hydrating: false });
  }, []);

  const login = useCallback<AuthContextValue["login"]>(
    async ({ email, password, expectedRole }) => {
      const { user, token } = await callAuth("/api/auth/login", {
        email,
        password,
        ...(expectedRole ? { expectedRole } : {}),
      });
      writeStored({ token, user });
      setState({ user, hydrating: false });
      return user;
    },
    [],
  );

  const register = useCallback<AuthContextValue["register"]>(
    async ({ name, email, password, phone, role, vehicleType, vehicleRegNumber, otp, restaurant, documents, zone, referralCode }) => {
      const body: Record<string, unknown> = { name, email, password, otp };
      if (phone) body.phone = phone;
      // Feat 6 — only attach referralCode for the customer sign-up
      // path. The partner/rider signup routes don't honour it.
      if (role === "CUSTOMER" && referralCode) {
        body.referralCode = referralCode;
      }
      // Rider-only fields. Server ignores them for non-RIDER roles.
      if (role === "RIDER") {
        if (vehicleType) body.vehicleType = vehicleType;
        if (vehicleRegNumber) body.vehicleRegNumber = vehicleRegNumber;
        // Bug 5 fix — bundle the chosen service zone into the
        // register POST so the server persists it on the freshly
        // created RiderProfile in the same transaction. Previously
        // the form made a second PUT to /api/riders/zone AFTER
        // registration, which failed with 401 because there was
        // no JWT yet at the registration step.
        if (zone) body.zone = zone;
      }
      // Partner-only fields. Server creates a Restaurant row +
      // RestaurantDocument rows when these are present. Ignored by
      // the customer/rider endpoints.
      if (role === "PARTNER") {
        if (restaurant) body.restaurant = restaurant;
        if (documents && documents.length > 0) body.documents = documents;
      }
      // Rider-only fields. Server creates RiderDocument rows when
      // these are present. Same pattern as the partner path.
      // Bug 2 — previously the rider form's license was a raw File
      // that the API couldn't process, and even if it had been
      // stringified, the rider register endpoint ignored documents
      // entirely. Now the form converts to dataUrl and we forward
      // the array to the rider endpoint.
      if (role === "RIDER") {
        if (documents && documents.length > 0) body.documents = documents;
      }
      // Route to the role-specific signup endpoint. Per the কাজ ২
      // security fix, the customer signup no longer accepts a `role`
      // field — so the customer form's role is silently dropped here
      // and the server hard-codes it to CUSTOMER. Partner and rider
      // signups have dedicated routes that hard-code their role.
      const path =
        role === "PARTNER"
          ? "/api/auth/register/partner"
          : role === "RIDER"
            ? "/api/auth/register/rider"
            : "/api/auth/register";
      const { user, token } = await callAuth(path, body);
      writeStored({ token, user });
      setState({ user, hydrating: false });
      return user;
    },
    [],
  );

  const logout = useCallback(() => {
    writeStored(null);
    setState({ user: null, hydrating: false });
  }, []);

  const setUser = useCallback((next: AuthUser | null) => {
    setState((s) => ({ ...s, user: next }));
    const stored = readStored();
    if (next && stored?.token) {
      writeStored({ token: stored.token, user: next });
    } else if (!next) {
      writeStored(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const stored = readStored();
    return {
      user: state.user,
      isLoggedIn: state.user !== null,
      token: state.user ? stored?.token ?? null : null,
      hydrating: state.hydrating,
      login,
      register,
      setUser,
      logout,
    };
  }, [state, login, register, setUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** `useAuth` — throws if used outside an `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
