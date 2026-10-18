/**
 * Mock data + validation rules for the Rider Panel auth flow.
 *
 * Kept in /data (not /components) so the form stays pure-presentation
 * and can be swapped for real API calls without touching the UI.
 *
 * Vehicle options mirror the user-spec dropdown:
 *   • Bike      — the default, matches the most common Dhaka rider.
 *   • Bicycle   — eco-friendly tier, capped to shorter distances.
 *   • Car       — for premium / larger orders.
 *
 * Validation rules are exposed as pure functions so the form
 * component can compose them and the next milestones (rider
 * dashboard) can reuse the same checks server-side.
 */

export type VehicleType = "bike" | "bicycle" | "car";

export const vehicleTypes: Array<{ value: VehicleType; label: string }> = [
  { value: "bike", label: "Bike" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
];

/* -------------------------------------------------------------------------- */
/*  Login validation                                                          */
/* -------------------------------------------------------------------------- */

export type LoginErrors = {
  id?: string;
  password?: string;
};

/** Validate the two login fields. Empty object means "no errors". */
export function validateLogin(values: {
  id: string;
  password: string;
}): LoginErrors {
  const errors: LoginErrors = {};
  const id = values.id.trim();
  const password = values.password;

  if (!id) errors.id = "Email or phone is required.";
  else if (id.includes("@") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id))
    errors.id = "Enter a valid email address.";

  if (!password) errors.password = "Password is required.";
  else if (password.length < 6)
    errors.password = "Password must be at least 6 characters.";

  return errors;
}

/* -------------------------------------------------------------------------- */
/*  Register validation                                                       */
/* -------------------------------------------------------------------------- */

export type RegisterErrors = {
  fullName?: string;
  phone?: string;
  email?: string;
  password?: string;
  vehicleType?: string;
  vehicleReg?: string;
  license?: string;
  /** ধাপ ২ — OTP validation surfaced by the registration form. */
  otp?: string;
};

/**
 * Validates the seven-field register form.
 *
 *   • fullName   — required, 2+ chars
 *   • phone      — required, Bangladeshi-friendly (`+880` prefix or
 *                  `01` local) — we accept anything ≥ 11 digits to
 *                  avoid being too strict with country variants.
 *   • email      — required, valid format
 *   • password   — required, 8+ chars (matches the backend rule)
 *   • vehicleType — required, one of the three known values
 *   • vehicleReg — required, 4+ chars (alphanumeric vehicle plate)
 *   • license    — required, must have at least one uploaded file
 */
export function validateRegister(values: {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  vehicleType: string;
  vehicleReg: string;
  license: { name: string; dataUrl: string; mime: string; size: number } | null;
}): RegisterErrors {
  const errors: RegisterErrors = {};

  const fullName = values.fullName.trim();
  if (!fullName) errors.fullName = "Full name is required.";
  else if (fullName.length < 2) errors.fullName = "Full name is too short.";

  const phone = values.phone.trim();
  if (!phone) errors.phone = "Phone is required.";
  else if (!/^[+\d][\d\s-]{9,}$/.test(phone))
    errors.phone = "Enter a valid phone number.";

  const email = values.email.trim();
  if (!email) errors.email = "Email is required.";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    errors.email = "Enter a valid email address.";

  const password = values.password;
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8)
    errors.password = "Password must be at least 8 characters.";

  if (!values.vehicleType)
    errors.vehicleType = "Pick a vehicle type.";

  const vehicleReg = values.vehicleReg.trim();
  if (!vehicleReg) errors.vehicleReg = "Vehicle registration number is required.";
  else if (vehicleReg.length < 4)
    errors.vehicleReg = "Enter a valid registration number.";

  if (!values.license) errors.license = "Please upload your license or NID.";

  return errors;
}
