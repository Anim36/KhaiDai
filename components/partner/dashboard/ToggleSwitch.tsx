"use client";

/**
 * Tiny iOS-style toggle (Figma `toggle-switch` frame, 36×20).
 *
 * Built as a real `<button>` + role="switch" so keyboard / screen
 * reader users get the native semantics (Space / Enter flip the
 * state, aria-checked reflects current value). Visual is the
 * standard pill + thumb with a brand-red background when on.
 *
 *   • `on` — controlled state.
 *   • `onChange` — fired with the next boolean on click.
 *   • `disabled` — non-interactive (kept for the partner side
 *      read-only sections; when true the visual stays at full
 *      strength and the pointer is just `cursor-not-allowed`).
 *   • `busy` — a separate in-flight signal used by the rider
 *      settings section to mark a save-in-progress without
 *      hiding the toggle's real on/off colour. Renders the same
 *      as `disabled` from the keyboard side (no click fires)
 *      but keeps the brand colour visible to make the wait
 *      obvious.
 *
 * Cursor is `pointer` whenever the toggle is interactive so the
 * "click me" affordance matches the actual behaviour.
 */
export function ToggleSwitch({
  on,
  onChange,
  ariaLabel,
  disabled = false,
  busy = false,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  ariaLabel: string;
  /** Renders as a non-interactive display when true. The visual
   *  remains at full colour (no `opacity-60`) so the user can see
   *  the live on/off state instead of a faded "disabled" grey. */
  disabled?: boolean;
  /** Save-in-flight flag — disables interaction while keeping the
   *  on/off colour visible. */
  busy?: boolean;
}) {
  const nonInteractive = disabled || busy;
  const cursor = nonInteractive ? "cursor-not-allowed" : "cursor-pointer";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      aria-disabled={nonInteractive || undefined}
      onClick={() => {
        if (nonInteractive) return;
        onChange?.(!on);
      }}
      onKeyDown={(e) => {
        if (nonInteractive) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange?.(!on);
        }
      }}
      className={
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
        (on ? "bg-brand" : "bg-line") +
        " " +
        cursor
      }
    >
      <span
        aria-hidden
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform " +
          (on ? "translate-x-[18px]" : "translate-x-[2px]")
        }
      />
    </button>
  );
}
