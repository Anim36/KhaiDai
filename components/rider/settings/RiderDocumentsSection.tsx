"use client";

import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Read-only section on the rider Settings page that lists the
 * documents the rider uploaded during registration (NID, Driving
 * License, Vehicle Registration).
 *
 * Data shape returned by `GET /api/riders/me/documents`.
 *   `fileUrl` is either an inline image data URL (e.g. "data:image/...")
 *   or an https URL. We render images directly and link out for PDFs.
 */

export type RiderDocumentRow = {
  id: string;
  documentType:
    | "NID"
    | "DRIVING_LICENSE"
    | "VEHICLE_REGISTRATION"
    | "OTHER";
  fileUrl: string;
  uploadedAt: string;
};

const TYPE_LABEL_KEYS: Record<RiderDocumentRow["documentType"], string> = {
  NID: "rider.settings.documents.type.NID",
  DRIVING_LICENSE: "rider.settings.documents.type.DRIVING_LICENSE",
  VEHICLE_REGISTRATION:
    "rider.settings.documents.type.VEHICLE_REGISTRATION",
  OTHER: "rider.settings.documents.type.OTHER",
};

/** Heuristic — does the fileUrl look like an image data URL? */
function isImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  // External URLs without a `.pdf` extension — treat as image. The
  // documents endpoint may also serve external CDN URLs; we don't
  // know the MIME type client-side, so we fall back to extension.
  if (/^https?:\/\//.test(url) && !/\.pdf(\?|$)/i.test(url)) return true;
  return false;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function RiderDocumentsSection({
  documents,
}: {
  documents: RiderDocumentRow[];
}) {
  const t = useT();

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("rider.settings.documents.title")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("rider.settings.documents.subtitle")}
        </p>
      </header>

      {documents.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          {t("rider.settings.documents.empty")}
        </p>
      ) : (
        <ul
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          data-section="rider-documents"
        >
          {documents.map((doc) => {
            const label = t(
              TYPE_LABEL_KEYS[doc.documentType] as Parameters<typeof t>[0],
            );
            const image = isImageUrl(doc.fileUrl);
            return (
              <li
                key={doc.id}
                data-document-type={doc.documentType}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface-page p-3"
              >
                <header className="flex items-start justify-between gap-2">
                  <span className="text-[14px] font-bold text-ink">
                    {label}
                  </span>
                  <span className="text-[10px] text-ink-muted">
                    {t("rider.settings.documents.uploadedAt", {
                      date: formatDate(doc.uploadedAt),
                    })}
                  </span>
                </header>
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={doc.fileUrl}
                    alt={label}
                    className="h-40 w-full rounded-lg border border-line bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-line bg-white">
                    <span className="text-[12px] text-ink-muted">
                      {t("rider.settings.documents.pdfPreview")}
                    </span>
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-action="view-document"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-white px-4 text-[12px] font-semibold text-brand hover:underline"
                    >
                      {t("rider.settings.documents.viewDocument")}
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}