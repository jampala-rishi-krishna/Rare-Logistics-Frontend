import { pickupPopupLines, UNABLE_TO_ASSIGN_TITLE, type PickupBlock } from "@/lib/assignmentRules";
import { buttonClass } from "./ToolbarControls";

/** "Unable to assign": one popup listing every customer pickup left out of an assignment (single or bulk). */
export default function UnableToAssignDialog({ blocked, assignedCount, onClose }: { blocked: PickupBlock[]; assignedCount?: number; onClose: () => void }) {
  if (!blocked.length) return null;
  const lines = pickupPopupLines(blocked);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unable-to-assign-title"
        className="w-full max-w-md border border-[#e4e3df] bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        data-testid="unable-to-assign-dialog"
      >
        <h2 id="unable-to-assign-title" className="text-lg font-bold">
          {UNABLE_TO_ASSIGN_TITLE}
        </h2>
        <ul className="mt-3 grid max-h-72 gap-3 overflow-y-auto text-sm" data-testid="unable-to-assign-list">
          {lines.map((line, index) => (
            <li key={blocked[index].id} className="border-l-2 border-[#86000B] pl-2">
              <p>{line.reason}</p>
              <p className="mt-1 text-xs text-[#55565a]">{line.details.join(" · ")}</p>
            </li>
          ))}
        </ul>
        {assignedCount ? (
          <p className="mt-3 text-xs text-[#77787b]">
            The other {assignedCount} order{assignedCount === 1 ? "" : "s"} {assignedCount === 1 ? "is" : "are"} assigned normally.
          </p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className={buttonClass} data-testid="unable-to-assign-close">
            OK
          </button>
        </div>
      </section>
    </div>
  );
}
