// scripts/_smoke_profile_change_request.mjs
//
// End-to-end smoke for the ProfileChangeRequest flow. Hits the
// live dev server (port 3000) over HTTP, creates a probe rider +
// admin, then exercises:
//
//   1. POST /api/riders/profile-change-request      → 201 + PENDING
//   2. GET  /api/admin/profile-change-requests      → 200, includes request
//   3. POST again with same requestType             → 409 "already pending"
//   4. PATCH /api/admin/profile-change-requests/[id] APPROVE → 200
//                                                   + profileNeedsReentry=true
//                                                   + notification row
//                                                   + AuditLog row
//   5. PATCH /api/riders/me (with new values)      → 200
//                                                   + profileNeedsReentry=false
//                                                   + User.name updated
//   6. VEHICLE_INFO repeat (request → approve → me.PATCH)
//   7. Reject path with admin note
//   8. Auth: rider can't hit admin endpoints
//
// One PASS/FAIL line per assertion + final summary.

import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error("JWT_SECRET not in .env");
  process.exit(2);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let passed = 0, failed = 0;
const log = (ok, msg, detail) => {
  if (ok) {
    console.log("PASS  " + msg);
    passed++;
  } else {
    console.log("FAIL  " + msg + (detail ? "  -- " + detail : ""));
    failed++;
  }
};

const stamp = Date.now();
const probe = {
  riderUserId: null,
  riderProfileId: null,
  profileReqId: null,
  vehicleReqId: null,
  rejectReqId: null,
};

function tokenFor(userId, role) {
  return jwt.sign({ sub: userId, role }, SECRET, { expiresIn: "1h" });
}

try {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    log(false, "admin user exists", "run scripts/create-admin.mjs first");
    throw new Error("missing admin");
  }
  const aTok = tokenFor(admin.id, "ADMIN");

  const rider = await prisma.user.create({
    data: {
      name: `Smoke Rider ${stamp}`,
      email: `smoke-rider-${stamp}@example.com`,
      password: "x",
      role: "RIDER",
      phone: `+8801${stamp.toString().slice(-9)}`,
    },
  });
  probe.riderUserId = rider.id;
  const profile = await prisma.riderProfile.create({
    data: {
      userId: rider.id,
      vehicleType: "bike",
      vehicleRegNumber: `ABC-${stamp.toString().slice(-6)}`,
    },
  });
  probe.riderProfileId = profile.id;
  const rTok = tokenFor(rider.id, "RIDER");

  async function http(method, path, token, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty */
    }
    return { status: res.status, data };
  }

  // ----- PROFILE_INFO happy path -----

  // 1. Submit a PROFILE_INFO request.
  let r = await http(
    "POST",
    "/api/riders/profile-change-request",
    rTok,
    { requestType: "PROFILE_INFO", note: "smoke probe" },
  );
  log(
    r.status === 201,
    "1. POST /api/riders/profile-change-request returns 201",
    `got ${r.status}`,
  );
  probe.profileReqId = r.data?.request?.id;
  log(
    r.data?.request?.status === "PENDING",
    "1a. created with status PENDING",
    `got ${r.data?.request?.status}`,
  );

  // 2. Admin queue lists it.
  r = await http(
    "GET",
    "/api/admin/profile-change-requests?status=PENDING",
    aTok,
  );
  const found = r.data?.requests?.some(
    (row) => row.id === probe.profileReqId,
  );
  log(
    r.status === 200 && found,
    "2. admin queue lists the new PENDING request",
    `status=${r.status} found=${found}`,
  );

  // 3. Duplicate submit returns 409.
  r = await http(
    "POST",
    "/api/riders/profile-change-request",
    rTok,
    { requestType: "PROFILE_INFO", note: "should not be allowed" },
  );
  log(
    r.status === 409,
    "3. duplicate PENDING submit returns 409",
    `got ${r.status}`,
  );

  // 4. Admin approves.
  r = await http(
    "PATCH",
    `/api/admin/profile-change-requests/${probe.profileReqId}`,
    aTok,
    { action: "APPROVE" },
  );
  log(
    r.status === 200,
    "4. admin APPROVE returns 200",
    `got ${r.status}`,
  );

  // 5. Side effects: flag flipped, notification, audit.
  const riderAfter = await prisma.user.findUnique({
    where: { id: probe.riderUserId },
  });
  log(
    riderAfter?.profileNeedsReentry === true,
    "5a. User.profileNeedsReentry flipped to true",
    `got ${riderAfter?.profileNeedsReentry}`,
  );

  const notif = await prisma.notification.findFirst({
    where: { userId: probe.riderUserId, title: "Profile change approved" },
  });
  log(!!notif, "5b. notification row created for the rider");

  const audit = await prisma.auditLog.findFirst({
    where: {
      entityId: probe.profileReqId,
      action: "PROFILE_CHANGE_REQUEST_APPROVE",
    },
  });
  log(!!audit, "5c. AuditLog row recorded for the approve");

  // 6. Rider PATCHes /api/riders/me with new name.
  const newName = `Smoke Rider Updated ${stamp}`;
  r = await http("PATCH", "/api/riders/me", rTok, {
    name: newName,
    email: rider.email,
    phone: rider.phone,
  });
  log(
    r.status === 200,
    "6. PATCH /api/riders/me succeeds after APPROVE",
    `got ${r.status}`,
  );
  const riderPost = await prisma.user.findUnique({
    where: { id: probe.riderUserId },
  });
  log(
    riderPost?.name === newName,
    "6a. User.name updated in DB",
    `got ${riderPost?.name}`,
  );
  log(
    riderPost?.profileNeedsReentry === false,
    "6b. profileNeedsReentry back to false",
    `got ${riderPost?.profileNeedsReentry}`,
  );

  // 7. Subsequent PATCH is rejected — fields are read-only again.
  r = await http("PATCH", "/api/riders/me", rTok, { name: "should-not-stick" });
  log(
    r.status === 403,
    "7. PATCH profile fields after re-entry returns 403",
    `got ${r.status}`,
  );

  // ----- VEHICLE_INFO happy path -----

  r = await http(
    "POST",
    "/api/riders/profile-change-request",
    rTok,
    { requestType: "VEHICLE_INFO", note: "switching to bicycle" },
  );
  log(
    r.status === 201 && r.data?.request?.status === "PENDING",
    "8. VEHICLE_INFO request created",
  );
  probe.vehicleReqId = r.data?.request?.id;

  r = await http(
    "PATCH",
    `/api/admin/profile-change-requests/${probe.vehicleReqId}`,
    aTok,
    { action: "APPROVE" },
  );
  log(r.status === 200, "8a. admin APPROVE on VEHICLE_INFO returns 200");

  const profileAfter = await prisma.riderProfile.findUnique({
    where: { id: probe.riderProfileId },
  });
  log(
    profileAfter?.vehicleNeedsReentry === true,
    "8b. RiderProfile.vehicleNeedsReentry flipped to true",
    `got ${profileAfter?.vehicleNeedsReentry}`,
  );

  r = await http("PATCH", "/api/riders/me", rTok, {
    vehicleType: "bicycle",
    vehicleRegNumber: `XYZ-${stamp.toString().slice(-6)}`,
  });
  log(r.status === 200, "8c. PATCH /api/riders/me vehicle fields succeeds");

  const profilePost = await prisma.riderProfile.findUnique({
    where: { id: probe.riderProfileId },
  });
  log(
    profilePost?.vehicleType === "bicycle",
    "8d. vehicleType updated in DB",
    `got ${profilePost?.vehicleType}`,
  );
  log(
    profilePost?.vehicleNeedsReentry === false,
    "8e. vehicleNeedsReentry back to false",
  );

  // ----- REJECT path -----

  r = await http(
    "POST",
    "/api/riders/profile-change-request",
    rTok,
    { requestType: "PROFILE_INFO", note: "trying to switch name" },
  );
  probe.rejectReqId = r.data?.request?.id;
  log(r.status === 201 && !!probe.rejectReqId, "9. third PROFILE_INFO created");

  // 9a. REJECT without adminNote → 400.
  r = await http(
    "PATCH",
    `/api/admin/profile-change-requests/${probe.rejectReqId}`,
    aTok,
    { action: "REJECT" },
  );
  log(
    r.status === 400,
    "9a. REJECT without adminNote returns 400",
    `got ${r.status}`,
  );

  // 9b. REJECT with note → 200.
  r = await http(
    "PATCH",
    `/api/admin/profile-change-requests/${probe.rejectReqId}`,
    aTok,
    { action: "REJECT", adminNote: "No real change needed." },
  );
  log(r.status === 200, "9b. REJECT with adminNote returns 200");

  const rej = await prisma.profileChangeRequest.findUnique({
    where: { id: probe.rejectReqId },
  });
  log(rej?.status === "REJECTED", "9c. status flipped to REJECTED");
  log(rej?.adminNote === "No real change needed.", "9d. adminNote saved");

  const rejectNotif = await prisma.notification.findFirst({
    where: { userId: probe.riderUserId, title: "Profile change rejected" },
  });
  log(!!rejectNotif, "9e. reject notification row created");

  const riderFinal = await prisma.user.findUnique({
    where: { id: probe.riderUserId },
  });
  log(
    riderFinal?.profileNeedsReentry === false,
    "9f. profileNeedsReentry stays false on REJECT",
    `got ${riderFinal?.profileNeedsReentry}`,
  );

  // ----- Auth gate -----

  r = await http(
    "GET",
    "/api/admin/profile-change-requests?status=PENDING",
    rTok,
  );
  log(
    r.status === 403,
    "10. RIDER token rejected by admin endpoint (403)",
    `got ${r.status}`,
  );

  // ----- Count endpoint -----

  r = await http(
    "GET",
    "/api/admin/profile-change-requests/count",
    aTok,
  );
  log(
    r.status === 200 && typeof r.data?.count === "number",
    "11. /count returns { count: number }",
    `got status=${r.status}`,
  );
} catch (err) {
  console.error("ERROR:", err.message ?? err);
  failed++;
} finally {
  try {
    for (const id of [probe.profileReqId, probe.vehicleReqId, probe.rejectReqId]) {
      if (id) {
        await prisma.auditLog.deleteMany({ where: { entityId: id } });
      }
    }
    await prisma.notification.deleteMany({
      where: { userId: probe.riderUserId },
    });
    await prisma.profileChangeRequest.deleteMany({
      where: { userId: probe.riderUserId },
    });
    if (probe.riderProfileId) {
      await prisma.riderProfile.delete({ where: { id: probe.riderProfileId } });
    }
    if (probe.riderUserId) {
      await prisma.user.delete({ where: { id: probe.riderUserId } });
    }
  } catch {
    /* best-effort */
  }
  await prisma.$disconnect();
}

console.log(`\nPROFILE CHANGE SMOKE: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);