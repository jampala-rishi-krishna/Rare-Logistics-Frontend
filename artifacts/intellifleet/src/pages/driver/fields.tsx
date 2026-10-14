import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { downscaleImage, canvasToPng } from "@/lib/tripMedia";
import { isFileValue } from "@/lib/tripForms";
import type { FormValue } from "@/lib/tripForms";
import type { TemplateItem } from "@/lib/tripTypes";
import { useT } from "./i18n";
import { C, FieldError, Icon } from "./ui";

export const fieldInput: CSSProperties = {
  height: 56,
  borderRadius: 14,
  border: `1px solid ${C.field}`,
  background: "#FFFFFF",
  padding: "0 16px",
  fontSize: 17,
  fontFamily: "inherit",
  color: C.ink,
  width: "100%",
  boxSizing: "border-box",
};

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 700 }}>{children}</div>;
}

// The design's photo block: big dashed "Add photo" tile; once taken, the thumbnail ("Photo 1 ✓") next to a "Retake" tile.
export function PhotoTiles({ value, onChange, testId = "driver-photo" }: { value: FormValue; onChange: (v: FormValue) => void; testId?: string }) {
  const t = useT();
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
  const has = isFileValue(value);
  const addTile = (
    <button
      type="button"
      disabled={working}
      onClick={() => inputRef.current?.click()}
      data-testid={`${testId}-add`}
      style={{ height: 108, borderRadius: 14, border: "1.5px dashed #9A9A92", background: C.soft, fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: C.ink, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", width: "100%" }}
    >
      <Icon name="camera" size={28} />
      {working ? "..." : has ? t.retakePhoto : t.addPhoto}
    </button>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: has ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: 10 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        data-testid="driver-photo-input"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {has && (
        <div
          data-testid={`${testId}-taken`}
          style={{ height: 108, borderRadius: 14, background: preview ? `#DCD9CF url(${preview}) center/cover no-repeat` : "#DCD9CF", display: "flex", alignItems: "flex-end", padding: 10, boxSizing: "border-box", fontSize: 13, fontWeight: 700, color: C.body }}
        >
          <span style={{ background: "rgba(255,255,255,.85)", borderRadius: 8, padding: "2px 6px" }}>{t.photoN(1)}</span>
        </div>
      )}
      {addTile}
    </div>
  );
}

// Touch / pointer signature pad -> PNG blob (updated at the end of every stroke). Only used if an admin adds one.
export function SignaturePad({ value, onChange }: { value: FormValue; onChange: (v: FormValue) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
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
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <canvas
        ref={canvasRef}
        width={640}
        height={240}
        data-testid="driver-signature-canvas"
        style={{ height: 160, width: "100%", touchAction: "none", border: `1.5px dashed #9A9A92`, borderRadius: 14, background: "#FFFFFF" }}
        onPointerDown={(e) => {
          e.preventDefault();
          canvasRef.current?.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = pos(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
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
        }}
        onPointerUp={() => void end()}
        onPointerCancel={() => void end()}
      />
      <button
        type="button"
        onClick={() => {
          const c = canvasRef.current;
          c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
          onChange(null);
        }}
        style={{ height: 44, borderRadius: 22, border: `1px solid ${C.field}`, background: "#FFFFFF", fontFamily: "inherit", fontWeight: 500, justifySelf: "end", padding: "0 16px" }}
      >
        {isFileValue(value) ? "Clear ✓" : "Clear"}
      </button>
    </div>
  );
}

// Generic renderer for one template item (extra items an admin adds to the delivery form or the acknowledge checklist).
export function TemplateField({ item, value, onChange, required, error, locked = false }: { item: TemplateItem; value: FormValue; onChange: (v: FormValue) => void; required: boolean; error?: string; locked?: boolean }) {
  const text = typeof value === "string" ? value : value === null || value === undefined || isFileValue(value) || typeof value === "boolean" ? "" : String(value);
  const options = item.options ?? [];
  let control: ReactNode;
  switch (item.item_type) {
    case "checkbox":
      return (
        <div data-testid={`driver-field-${item.key}`} style={{ display: "grid", gap: 6 }}>
          <button
            type="button"
            aria-pressed={value === true}
            disabled={locked}
            onClick={() => onChange(!(value === true))}
            style={{ minHeight: 56, borderRadius: 14, border: value === true ? `1.5px solid ${C.ink}` : `1px solid ${C.field}`, background: value === true ? C.soft : "#FFFFFF", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", fontFamily: "inherit", fontSize: 16, fontWeight: 700, color: C.ink, textAlign: "left", cursor: "pointer" }}
          >
            <span style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${C.ink}`, background: value === true ? C.ink : "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {value === true && <Icon name="check" size={18} color="#FFFFFF" width={2.4} />}
            </span>
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              {item.label}
              {required ? " *" : ""}
            </span>
          </button>
          <FieldError>{error}</FieldError>
        </div>
      );
    case "textarea":
    case "note":
      control = <textarea value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...fieldInput, height: "auto", padding: "12px 16px" }} />;
      break;
    case "dropdown":
    case "radio":
      control = (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={text === o}
              disabled={locked}
              onClick={() => onChange(o)}
              style={{ minHeight: 44, padding: "6px 16px", borderRadius: 22, border: text === o ? `1px solid ${C.ink}` : `1px solid ${C.field}`, background: text === o ? C.ink : "#FFFFFF", color: text === o ? "#FFFFFF" : C.ink, fontFamily: "inherit", fontSize: 14, fontWeight: text === o ? 700 : 500 }}
            >
              {o}
            </button>
          ))}
        </div>
      );
      break;
    case "numeric_text":
    case "count":
      control = <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} style={fieldInput} />;
      break;
    case "number":
      control = <input type="text" inputMode="decimal" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} style={fieldInput} />;
      break;
    case "date":
      control = <input type="date" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} style={fieldInput} />;
      break;
    case "datetime":
      control = <input type="datetime-local" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} style={fieldInput} />;
      break;
    case "photo":
      control = <PhotoTiles value={value} onChange={onChange} testId={`driver-photo-${item.key}`} />;
      break;
    case "signature":
      control = <SignaturePad value={value} onChange={onChange} />;
      break;
    default:
      control = <input type="text" value={text} readOnly={locked} onChange={(e) => onChange(e.target.value)} style={fieldInput} />;
  }
  return (
    <div data-testid={`driver-field-${item.key}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <FieldLabel>
        {item.label}
        {required ? " *" : ""}
      </FieldLabel>
      {control}
      <FieldError>{error}</FieldError>
    </div>
  );
}
