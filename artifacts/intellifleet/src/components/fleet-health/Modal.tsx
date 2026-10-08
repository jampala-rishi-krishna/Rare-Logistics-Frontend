import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cx } from "./ui";

/**
 * One overlay for every Fleet Health form and the truck drawer.
 *  - variant "dialog": centred dialog on desktop, full-screen sheet below `md`.
 *  - variant "drawer": right-hand sheet on desktop (wide), full-screen below `md`.
 * Body scrolls; header and footer stay put (the footer doubles as the sticky submit bar on phones).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  headerExtra,
  children,
  footer,
  variant = "dialog",
  width = "max-w-xl",
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "dialog" | "drawer";
  width?: string;
  testId?: string;
}) {
  const position =
    variant === "drawer"
      ? cx("inset-0 md:left-auto md:right-0 md:w-[min(820px,100vw)] data-[state=open]:md:slide-in-from-right data-[state=closed]:md:slide-out-to-right md:border-l")
      : cx("inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[90dvh] md:w-[calc(100vw-48px)] md:-translate-x-1/2 md:-translate-y-1/2 md:border", width);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#0b0b0b]/55 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-testid={testId}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Don't pop a mobile keyboard on open: focus the dialog container itself.
            if (variant === "dialog") return;
            e.preventDefault();
          }}
          className={cx(
            "fixed z-50 flex h-[100dvh] w-full flex-col overflow-hidden border-[#d8d7d2] bg-[#fafaf8] shadow-2xl duration-200 focus:outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            variant === "drawer" ? "md:h-[100dvh]" : "md:h-auto",
            position,
          )}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-[#e4e3df] bg-white px-4 py-4 md:px-6">
            <div className="min-w-0 flex-1">
              {eyebrow && <div className="micro mb-1.5 text-[#77787b]">{eyebrow}</div>}
              <Dialog.Title className="display-face truncate text-2xl font-bold leading-none md:text-[26px]">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-2 text-[13px] leading-5 text-[#77787b]">{description}</Dialog.Description>}
              {headerExtra}
            </div>
            <Dialog.Close aria-label="Close" className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-[4px] text-[#55565a] hover:bg-[#f2f2ef] hover:text-black md:h-9 md:w-9">
              <X size={18} aria-hidden />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <footer className="shrink-0 border-t border-[#e4e3df] bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-6">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmation dialog (small). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  busy,
  error,
  danger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  error?: ReactNode;
  danger?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#0b0b0b]/55 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 border border-[#0b0b0b] bg-white p-5 shadow-2xl focus:outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <Dialog.Title className="display-face text-xl font-bold">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-2 text-sm leading-6 text-[#55565a]">{body}</div>
          </Dialog.Description>
          {error && <div className="mt-3 text-[13px] text-[#a32720]">{error}</div>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close className="inline-flex h-11 items-center justify-center rounded-[4px] border border-[#d8d7d2] bg-white px-4 text-sm! font-medium md:h-9 md:px-3">Cancel</Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={cx(
                "inline-flex h-11 items-center justify-center rounded-[4px] border px-4 text-sm! font-medium text-white disabled:opacity-60 md:h-9 md:px-3",
                danger ? "border-[#86000B] bg-[#86000B] hover:bg-[#6d0009]" : "border-[#0b0b0b] bg-[#0b0b0b] hover:bg-[#242424]",
              )}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
