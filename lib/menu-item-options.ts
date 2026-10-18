// lib/menu-item-options.ts
//
// Feat 1 — shared server-side validation + payload normalisation
// for the `options` array on `POST /api/menu-items` and
// `PATCH /api/menu-items/[id]`. The Partner Menu Modal edits a
// whole option tree in-place and POSTs it back in one go, so
// both endpoints funnel through `normaliseOptionsDraft` to keep
// the rules identical.

import { Prisma } from "@prisma/client";

export type OptionDraftChoice = {
  id?: unknown;
  label?: unknown;
  priceDelta?: unknown;
};

export type OptionDraft = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  required?: unknown;
  choices?: unknown;
};

export type NormalisedOption = {
  id: string | null;
  name: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE";
  required: boolean;
  choices: Array<{
    id: string | null;
    label: string;
    priceDelta: number;
  }>;
};

export type NormaliseError = string;

/**
 * Validate + normalise the `options` array from a menu-item
 * POST/PATCH body.
 *
 * Rules:
 *   • max 5 option groups per item
 *   • max 10 choices per group
 *   • `name` 1-40 chars
 *   • `type` ∈ {"SINGLE_CHOICE","MULTI_CHOICE"}
 *   • `required` boolean
 *   • every choice `label` 1-40 chars
 *   • `priceDelta` integer in [-10000, +10000]
 *   • choices with empty label are dropped silently (lets the
 *     partner remove a row in the modal without leaving a stub)
 *
 * Returns either a `{ ok: true, value }` payload (always
 * non-null; pass that to Prisma `create` / `update`) or
 * `{ ok: false, error }` (a 400 message).
 */
export function normaliseOptionsDraft(
  raw: unknown,
):
  | { ok: true; value: NormalisedOption[] }
  | { ok: false; error: NormaliseError } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "options must be an array" };
  }
  if (raw.length > 5) {
    return { ok: false, error: "A menu item can have at most 5 option groups" };
  }

  const out: NormalisedOption[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i] as OptionDraft;
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: `options[${i}] must be a JSON object` };
    }
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (name.length < 1 || name.length > 40) {
      return { ok: false, error: `options[${i}].name must be 1-40 characters` };
    }
    if (
      entry.type !== "SINGLE_CHOICE" &&
      entry.type !== "MULTI_CHOICE"
    ) {
      return {
        ok: false,
        error: `options[${i}].type must be SINGLE_CHOICE or MULTI_CHOICE`,
      };
    }
    const required = entry.required === true;
    const id =
      typeof entry.id === "string" && entry.id.length > 0 ? entry.id : null;
    if (!Array.isArray(entry.choices)) {
      return { ok: false, error: `options[${i}].choices must be an array` };
    }
    if (entry.choices.length > 10) {
      return {
        ok: false,
        error: `options[${i}] can have at most 10 choices`,
      };
    }
    const choices: NormalisedOption["choices"] = [];
    for (let j = 0; j < entry.choices.length; j++) {
      const c = entry.choices[j] as OptionDraftChoice;
      if (!c || typeof c !== "object") {
        return {
          ok: false,
          error: `options[${i}].choices[${j}] must be a JSON object`,
        };
      }
      const label = typeof c.label === "string" ? c.label.trim() : "";
      if (label.length === 0) continue; // silent drop
      if (label.length > 40) {
        return {
          ok: false,
          error: `options[${i}].choices[${j}].label must be 1-40 characters`,
        };
      }
      const pd = Number(c.priceDelta);
      if (!Number.isFinite(pd) || !Number.isInteger(pd) || pd < -10000 || pd > 10000) {
        return {
          ok: false,
          error: `options[${i}].choices[${j}].priceDelta must be an integer in [-10000, +10000]`,
        };
      }
      const cid =
        typeof c.id === "string" && c.id.length > 0 ? c.id : null;
      choices.push({ id: cid, label, priceDelta: pd });
    }
    if (choices.length === 0) {
      // Skip a group with no real choices — keeps the DB tidy.
      continue;
    }
    if (required && entry.type === "SINGLE_CHOICE" && choices.length > 0) {
      // Fine — required SINGLE_CHOICE needs ≥1 choice.
    }
    out.push({
      id,
      name,
      type: entry.type,
      required,
      choices,
    });
  }
  return { ok: true, value: out };
}

/**
 * Apply a normalised option list to a `MenuItem` (creating
 * new options / choices, updating existing ones, deleting
 * removed ones). Runs inside the caller's transaction.
 *
 *   • `id: null`  → create.
 *   • `id: "cu…"` → upsert; the row is either kept (if the
 *     draft still has it) or deleted (if absent from the
 *     draft).
 *
 * Choice rows reconcile the same way: an option keeps the
 * union of its draft choice ids and the persisted choice ids.
 * Persisted rows that the draft removed are deleted; new ones
 * are created.
 */
export async function applyOptionsToMenuItem(
  tx: Prisma.TransactionClient,
  args: {
    menuItemId: string;
    draft: NormalisedOption[];
  },
): Promise<void> {
  const { menuItemId, draft } = args;

  // Load everything we know about the current options for this item.
  const current = await tx.menuItemOption.findMany({
    where: { menuItemId },
    include: { choices: true },
  });
  const currentById = new Map(current.map((o) => [o.id, o]));
  const draftById = new Map(
    draft.filter((d) => d.id).map((d) => [d.id as string, d]),
  );

  // 1) Delete options that no longer appear in the draft.
  for (const o of current) {
    if (!draftById.has(o.id)) {
      // Choices cascade via the FK (onDelete: Cascade).
      await tx.menuItemOption.delete({ where: { id: o.id } });
    }
  }

  // 2) Upsert each draft option.
  for (let i = 0; i < draft.length; i++) {
    const d = draft[i];
    const sortOrder = i;
    let optionId: string;
    if (d.id && currentById.has(d.id)) {
      const updated = await tx.menuItemOption.update({
        where: { id: d.id },
        data: {
          name: d.name,
          type: d.type,
          required: d.required,
          sortOrder,
        },
      });
      optionId = updated.id;
    } else {
      const created = await tx.menuItemOption.create({
        data: {
          menuItemId,
          name: d.name,
          type: d.type,
          required: d.required,
          sortOrder,
          choices: {
            create: d.choices.map((c, j) => ({
              label: c.label,
              priceDelta: c.priceDelta,
              sortOrder: j,
            })),
          },
        },
      });
      optionId = created.id;
      continue; // new option already had its choices created above
    }

    // 3) Reconcile the choices on the existing option.
    const persisted = currentById.get(optionId);
    if (!persisted) continue;
    const persistedById = new Map(
      persisted.choices.map((c) => [c.id, c]),
    );
    const draftChoiceById = new Map(
      d.choices.filter((c) => c.id).map((c) => [c.id as string, c]),
    );
    // Delete choices no longer in the draft.
    for (const c of persisted.choices) {
      if (!draftChoiceById.has(c.id)) {
        await tx.menuItemOptionChoice.delete({ where: { id: c.id } });
      }
    }
    // Upsert each draft choice.
    for (let j = 0; j < d.choices.length; j++) {
      const dc = d.choices[j];
      if (dc.id && persistedById.has(dc.id)) {
        await tx.menuItemOptionChoice.update({
          where: { id: dc.id },
          data: {
            label: dc.label,
            priceDelta: dc.priceDelta,
            sortOrder: j,
          },
        });
      } else {
        await tx.menuItemOptionChoice.create({
          data: {
            optionId,
            label: dc.label,
            priceDelta: dc.priceDelta,
            sortOrder: j,
          },
        });
      }
    }
  }
}