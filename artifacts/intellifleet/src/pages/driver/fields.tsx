import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Camera } from "lucide-react";
import { downscaleImage, canvasToPng } from "@/lib/tripMedia";
import { isFileValue } from "@/lib/tripForms";
import type { FormValue } from "@/lib/tripForms";
import type { TemplateItem } from "@/lib/tripTypes";
import { btnSecondary, inputClass } from "./shared";

export function FieldShell({ item, required, error, children }: { item: TemplateItem; required: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5" data-testid={`driver-field-${item.key}`}>
      <div className="text-sm font-semibold">
        {item.label}
        {required && (
          <span className="ml-1 text-[#86000B]" aria-label="required">
            *
          </span>
        )}
      </div>
      {children}
      {error && (
        <p role="alert" className="text-sm font-semibold text-[#86000B]">
          {error}
        </p>
      )}
    </div>
  );
}

export function PhotoField({ value, onChange, label }: { value: FormValue; onChange: (v: FormValue) => void; label: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!isFileValue(value)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setWorking(true);
    try {
      onChange(await downscaleImage(file));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid gap-2">
      {preview && <img src={preview} alt={label} className="max-h-64 w-full border border-[#e4e3df] object-contain" />}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid="driver-photo-input"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button type="button" disabled={working} onClick={() => inputRef.current?.click()} className={btnSecondary}>
        <Camera size={18} />
        {working ? "Processing..." : isFileValue(value) ? "Retake photo" : "Take photo"}
      </button>
    </div>
  );
}

// Touch / pointer signature pad -> PNG blob (updated at the end of every stroke).
export function SignaturePad({ value, onChange }: { value: FormValue; onChange: (v: FormValue) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const end = async () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const c = canvasRef.current;
    if (!c) return;
    const png = await canvasToPng(c);
    if (png) onChange(png);
  };
  const clear = () => {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    onChange(null);
  };

  return (
    <div className="grid gap-2">
      <canvas
        ref={canvasRef}
        width={640}
        height={240}
        data-testid="driver-signature-canvas"
        className="h-40 w-full touch-none border border-dashed border-[#77787b] bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => void end()}
        onPointerCancel={() => void end()}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[#55565a]">{isFileValue(value) ? "Signature captured" : "Sign above with your finger"}</span>
        <button type="button" onClick={clear} className="min-h-[48px] border border-[#d8d7d2] bg-white px-5 text-sm font-semibold">
          Clear
        </button>
      </div>
    </div>
  );
}

// Generic renderer for one delivery-form item. `locked` = prefilled from the order (read-only).
export function CheckoutField({
  item,
  value,
  onChange,
  required,
  error,
  locked,
}: {
  item: TemplateItem;
  value: FormValue;
  onChange: (v: FormValue) => void;
  required: boolean;
  error?: string;
  locked: boolean;
}) {
  const text = typeof value === "string" ? value : value === null || value === undefined || isFileValue(value) || typeof value === "boolean" ? "" : String(value);
  const options = item.options ?? [];
  let control: ReactNode;
  switch (item.item_type) {
    case "textarea":
      control = <textarea value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} rows={3} className={`${inputClass} py-2`} />;
      break;
    case "dropdown":
      control = (
        <select value={text} disabled={locked} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Select...</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "radio":
      control = (
        <div className="grid gap-2" role="radiogroup">
          {options.map((o) => (
            <label key={o} className={`flex min-h-[48px] items-center gap-3 border px-3 text-base ${text === o ? "border-black bg-[#f2f2ef]" : "border-[#d8d7d2] bg-white"}`}>
              <input type="radio" name={item.key} checked={text === o} disabled={locked} onChange={() => onChange(o)} className="h-5 w-5" />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    case "number":
      control = <input type="text" inputMode="decimal" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
      break;
    case "date":
      control = <input type="date" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
      break;
    case "datetime":
      control = <input type="datetime-local" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
      break;
    case "checkbox":
      control = (
        <label className="flex min-h-[48px] items-center gap-3 border border-[#d8d7d2] bg-white px-3 text-base">
          <input type="checkbox" checked={value === true} disabled={locked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6" />
          Yes
        </label>
      );
      break;
    case "photo":
      control = <PhotoField value={value} onChange={onChange} label={item.label} />;
      break;
    case "signature":
      control = <SignaturePad value={value} onChange={onChange} />;
      break;
    default:
      control = <input type="text" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
  }
  return (
    <FieldShell item={item} required={required} error={error}>
      {control}
      {locked && <p className="text-xs text-[#77787b]">From the order</p>}
    </FieldShell>
  );
}
