import { CheckIcon } from "@/components/icons";

type Step = {
  id: string;
  label: string;
  description: string;
};

const STEPS: Step[] = [
  { id: "confirmed", label: "Confirmed", description: "We received your order" },
  { id: "preparing", label: "Preparing", description: "The restaurant is cooking" },
  { id: "picked_up", label: "Picked Up", description: "Rider has your food" },
  { id: "on_the_way", label: "On the Way", description: "Heading to your address" },
  { id: "delivered", label: "Delivered", description: "Enjoy your meal!" },
];

/**
 * Five-step vertical timeline. `currentStatus` is the step currently in
 * progress — earlier steps are "done" (filled brand circle + tick),
 * `currentStatus` is highlighted, later steps are muted.
 */
export function StatusTimeline({
  currentStatus,
}: {
  currentStatus: string;
}) {
  const currentIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.id === currentStatus)
  );

  return (
    <ol className="flex flex-col gap-0">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === STEPS.length - 1;

        return (
          <li key={step.id} className="relative flex gap-4 pb-7 last:pb-0">
            {/* Vertical connector line */}
            {!isLast && (
              <span
                aria-hidden
                className={
                  "absolute left-[15px] top-[34px] bottom-0 w-[2px] " +
                  (isDone || isCurrent ? "bg-brand" : "bg-line")
                }
              />
            )}

            {/* Step node */}
            <span
              className={
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 " +
                (isDone
                  ? "border-brand bg-brand text-white"
                  : isCurrent
                    ? "border-brand bg-white text-brand"
                    : "border-line bg-white text-ink-muted")
              }
            >
              {isDone ? (
                <CheckIcon size={14} />
              ) : (
                <span className="text-[13px] font-bold">{i + 1}</span>
              )}
              {isCurrent && (
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 animate-ping rounded-full bg-brand/30"
                />
              )}
            </span>

            {/* Label + description */}
            <div className="flex flex-col pt-1">
              <span
                className={
                  "font-display text-[15px] font-bold leading-none " +
                  (isDone || isCurrent ? "text-ink" : "text-ink-muted")
                }
              >
                {step.label}
              </span>
              <span className="mt-1 text-[13px] text-ink-muted">
                {step.description}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
