// lib/upload-limits.ts
//
// Single source of truth for the partner-side file-size caps. The
// constants here are imported by both the frontend (to validate
// before the upload starts) and the backend routes (to reject
// oversized data URLs before they hit Prisma).
//
// Why a shared module?
//   • The upload is a data URL (`data:image/...;base64,...`), so a
//     10 MB raw image becomes ~13.3 MB once base64-encoded. We
//     double that on the API side so the JSON body has plenty of
//     room without a 413.
//   • Frontend error copy ("Image is too large (max X MB). Try a
//     smaller file.") and backend error copy both pull from these
//     constants so a future bump only needs editing here.
//
// ── Vercel body-cap constraint ────────────────────────────────────────────
// Vercel caps serverless request bodies at **4.5 MB**. A single
// 10 MB raw cover image is therefore *not* safe to ship as a
// base64 data URL inside a JSON POST — the request will be
// rejected with 413 before our route handler ever runs. The fix
// lives in `lib/clientImage.ts` (client-side compression to max
// 1600 px JPEG @ quality 0.82, which typically drops a 6 MB
// phone photo to ~300 KB), but the *post-compression* ceiling on
// the data-URL envelope has to stay well under 4.5 MB to leave
// room for the rest of the JSON body.

/**
 * Hard cap for the **post-compression** cover image (after the
 * client-side compressor runs). A JPEG at max 1600 px and quality
 * 0.82 is ~250–500 KB even for a 6 MB phone photo, so 1.5 MB is a
 * very safe ceiling and still leaves ~3 MB for the rest of the
 * JSON envelope.
 */
export const MAX_COVER_BYTES = 1.5 * 1024 * 1024;
export const MAX_COVER_BYTES_MB = 1.5;

/**
 * Cover images are base64-encoded into a JSON `coverImage` string.
 * The base64 expansion adds ≈ 4/3 to the raw bytes, so we give the
 * API a small headroom multiplier (×1.05) so transient
 * JSON-formatter overhead never trips the check — the **post-
 * compression** data-URL length must stay under ~2 MB to fit
 * inside Vercel's 4.5 MB body cap alongside the rest of the
 * payload.
 */
export const MAX_COVER_DATA_URL_CHARS = Math.ceil(MAX_COVER_BYTES * (4 / 3) * 1.05);

/** Same envelope for menu-item photos. */
export const MAX_MENU_IMAGE_BYTES = 1 * 1024 * 1024;
export const MAX_MENU_IMAGE_BYTES_MB = 1;
export const MAX_MENU_IMAGE_DATA_URL_CHARS = Math.ceil(MAX_MENU_IMAGE_BYTES * (4 / 3) * 1.05);

/**
 * Non-image uploads (PDF vehicle-registration scans, NID scans,
 * trade-licence, etc.). Vercel body cap is 4.5 MB, the JSON
 * envelope around a 3 MB base64 data-URL adds ~0.1 MB, so 3 MB is
 * the safe raw ceiling for these documents.
 */
export const MAX_DOC_BYTES = 3 * 1024 * 1024;
export const MAX_DOC_BYTES_MB = 3;
export const MAX_DOC_DATA_URL_CHARS = MAX_DOC_BYTES * 2;
