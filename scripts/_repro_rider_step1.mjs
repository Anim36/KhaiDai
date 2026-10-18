// Repro for Bug 1: Rider Step 1 Continue button not advancing.
//
// We test the validateRegister function with the typical user
// input. If validateRegister returns ANY error in the 4 step-1
// fields, the continue button silently fails.
//
// Run this directly:
//   node scripts/_repro_rider_step1.mjs
import { validateRegister } from "../data/rider.ts";

// We need to import via the compiled TS. Use a quick inline
// reimplementation for the buggy function to avoid the build
// step. The bug is in the regex / logic for these fields:

function inlineValidate(values) {
  const errors = {};
  const fullName = (values.fullName || "").trim();
  if (!fullName) errors.fullName = "Full name is required.";
  else if (fullName.length < 2) errors.fullName = "Full name is too short.";

  const phone = (values.phone || "").trim();
  if (!phone) errors.phone = "Phone is required.";
  else if (!/^[+\d][\d\s-]{9,}$/.test(phone))
    errors.phone = "Enter a valid phone number.";

  const email = (values.email || "").trim();
  if (!email) errors.email = "Email is required.";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    errors.email = "Enter a valid email address.";

  const password = values.password || "";
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8)
    errors.password = "Password must be at least 8 characters.";

  if (!values.vehicleType)
    errors.vehicleType = "Pick a vehicle type.";

  const vehicleReg = (values.vehicleReg || "").trim();
  if (!vehicleReg) errors.vehicleReg = "Vehicle registration number is required.";
  else if (vehicleReg.length < 4)
    errors.vehicleReg = "Enter a valid registration number.";

  if (!values.license) errors.license = "Please upload your license or NID.";

  return errors;
}

// Test cases — simulate what a user would enter in step 1.
const cases = [
  {
    name: "ideal data",
    input: {
      fullName: "Tanvir Hossain",
      phone: "+8801711005142",
      email: "tanvir@example.com",
      password: "password123",
      vehicleType: "",
      vehicleReg: "",
      license: null,
    },
  },
  {
    name: "phone with space after country code",
    input: {
      fullName: "Tanvir Hossain",
      phone: "+880 1711-005142",
      email: "tanvir@example.com",
      password: "password123",
      vehicleType: "",
      vehicleReg: "",
      license: null,
    },
  },
  {
    name: "no plus prefix in phone",
    input: {
      fullName: "Tanvir Hossain",
      phone: "01711005142",
      email: "tanvir@example.com",
      password: "password123",
      vehicleType: "",
      vehicleReg: "",
      license: null,
    },
  },
];

for (const c of cases) {
  const errs = inlineValidate(c.input);
  const step1Only = {
    fullName: errs.fullName,
    phone: errs.phone,
    email: errs.email,
    password: errs.password,
  };
  const keys = Object.keys(step1Only).filter((k) => step1Only[k]);
  console.log(`\n[${c.name}]`);
  console.log(`  input.phone = ${JSON.stringify(c.input.phone)}`);
  console.log(`  all errors = ${JSON.stringify(errs)}`);
  console.log(`  step-1 errors = ${JSON.stringify(step1Only)}`);
  console.log(`  → Continue would advance? ${keys.length === 0 ? "YES" : "NO"}`);
  if (keys.length > 0) {
    for (const k of keys) console.log(`    ${k}: ${step1Only[k]}`);
  }
}