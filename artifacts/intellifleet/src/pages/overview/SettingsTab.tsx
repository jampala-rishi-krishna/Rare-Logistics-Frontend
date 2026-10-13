import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import {
  DRAFT_BADGE_TEXT,
  ITEM_TYPES,
  blankItem,
  buildTemplatePayload,
  moveItem,
  needsOptions,
  relabel,
  removeItem,
  toEditorItems,
  validateTemplate,
} from "@/lib/overview";
import type { EditorItem, TemplateKindId } from "@/lib/overview";
import { Chip, ErrorNote, Skeleton, buttonClass, fmtDateTime, inputClass, primaryButtonClass, useSessionRole } from "./shared";

const COPY: Record<TemplateKindId, { title: string; blurb: string }> = {
  acknowledge_checklist: {
    title: "Acknowledgement checklist (step 2)",
    blurb: "Each SO is acknowledged by completing this checklist: completed = the products and documents are in the crew's custody. The items below are placeholders until Logistics sends the real list.",
  },
  delivery_checkout: {
    title: "Delivery time log (steps 4 and 5)",
    blurb: "Mirrors the Zoho form \"B2B Logistics Delivery\": Name, Sales Order Number, Invoice or DR Number, Time Logs (Arrived at Site = check-in, Departed from Site = this form) and the phone's GPS are recorded automatically or asked as below. Fields marked \"added in app\" are not in the Zoho form: switch them off to stop asking.",
  },
};

function ItemCard({ item, index, count, others, readOnly, kind, onChange, onMove, onRemove }: {
  item: EditorItem;
  index: number;
  count: number;
  others: EditorItem[];
  readOnly: boolean;
  kind: TemplateKindId;
  onChange: (patch: Partial<EditorItem>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <li className={`border bg-white p-3 ${item.active ? "border-[#e4e3df]" : "border-dashed border-[#c9c8c3] opacity-75"}`} data-testid={`setting-item-${item.key}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-[#77787b]">{item.key}</span>
        {item.appOnly && <Chip tone="info">Added in app, not in Zoho form</Chip>}
        {!item.appOnly && kind === "delivery_checkout" && <Chip tone="good">In the Zoho form</Chip>}
        {!item.active && <Chip tone="warn">Switched off</Chip>}
        {!readOnly && (
          <span className="ml-auto flex gap-1">
            <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} className={`${buttonClass} !min-h-[32px] !px-2`}>
              <ArrowUp size={14} />
            </button>
            <button type="button" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)} className={`${buttonClass} !min-h-[32px] !px-2`}>
              <ArrowDown size={14} />
            </button>
            <button type="button" aria-label="Remove item" onClick={onRemove} className={`${buttonClass} !min-h-[32px] !px-2`}>
              <Trash2 size={14} />
            </button>
          </span>
        )}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px]">
        <label className="grid gap-1 text-xs font-semibold">
          Label
          <input value={item.label} disabled={readOnly} onChange={(e) => onChange({ label: e.target.value })} className={inputClass} aria-label="Label" />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Type
          <select value={item.item_type} disabled={readOnly} onChange={(e) => onChange({ item_type: e.target.value })} className={inputClass} aria-label="Type">
            {ITEM_TYPES[kind].map((t) => (
              <option key={t} value={t}>
                {t === "numeric_text" ? "numeric_text (digits only)" : t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {needsOptions(item.item_type) && (
        <label className="mt-2 grid gap-1 text-xs font-semibold">
          Options (comma or one per line)
          <textarea value={item.optionsText} disabled={readOnly} onChange={(e) => onChange({ optionsText: e.target.value })} rows={2} className={`${inputClass} py-1.5`} />
        </label>
      )}
      {kind === "delivery_checkout" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold">
            Show only when item
            <select value={item.showWhenKey} disabled={readOnly} onChange={(e) => onChange({ showWhenKey: e.target.value })} className={inputClass} aria-label="Show when item">
              <option value="">Always</option>
              {others.map((o) => (
                <option key={o.uid} value={o.key}>
                  {o.key}
                </option>
              ))}
            </select>
          </label>
          {item.showWhenKey && (
            <label className="grid gap-1 text-xs font-semibold">
              ...is one of
              <input value={item.showWhenIn} disabled={readOnly} onChange={(e) => onChange({ showWhenIn: e.target.value })} className={inputClass} placeholder="Partially delivered, Failed" />
            </label>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={item.required} disabled={readOnly} onChange={(e) => onChange({ required: e.target.checked })} /> Required
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={item.active} disabled={readOnly} onChange={(e) => onChange({ active: e.target.checked })} /> {item.appOnly ? "Ask this in the app" : "Active"}
        </label>
      </div>
    </li>
  );
}

function TemplateEditor({ kind, data, canEdit }: { kind: TemplateKindId; data: overviewApi.TemplatesResponse[TemplateKindId]; canEdit: boolean }) {
  const client = useQueryClient();
  const active = data.active;
  const [viewing, setViewing] = useState<number>(active.version);
  const version = useQuery({ queryKey: ["overview-template-version", kind, viewing], queryFn: () => overviewApi.getTemplateVersion(kind, viewing), enabled: viewing !== active.version });
  const shown = viewing === active.version ? active : version.data;
  const [name, setName] = useState(active.name);
  const [items, setItems] = useState<EditorItem[]>(() => toEditorItems(active.items));
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    if (shown) {
      setName(shown.name);
      setItems(toEditorItems(shown.items));
      setErrors([]);
    }
  }, [shown?.id, shown?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const isActiveVersion = viewing === active.version;
  const readOnly = !canEdit || !isActiveVersion;
  const save = useMutation({
    mutationFn: () => overviewApi.saveTemplate(kind, buildTemplatePayload(kind, name, items)),
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: ["overview-templates"] });
      setViewing(saved.version);
    },
  });
  const submit = () => {
    const found = validateTemplate(kind, name, items).map((e) => e.message);
    setErrors(found);
    if (found.length === 0) save.mutate();
  };
  const patch = (uid: string, p: Partial<EditorItem>) => setItems((list) => (p.label !== undefined && Object.keys(p).length === 1 ? relabel(list, uid, p.label) : list.map((it) => (it.uid === uid ? { ...it, ...p } : it))));
  const copy = COPY[kind];
  const draft = shown?.is_draft ?? active.is_draft;
  const sourceNote = (shown as { source_note?: string | null } | undefined)?.source_note ?? (active as { source_note?: string | null }).source_note;
  const outstanding = useMemo(() => items.length, [items]);
  return (
    <section className="grid gap-3 border border-[#e4e3df] bg-[#fafaf8] p-3" data-testid={`settings-${kind}`}>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">{copy.title}</h2>
          <Chip tone="info">Version {viewing}</Chip>
          {draft && <Chip tone="warn">{DRAFT_BADGE_TEXT}</Chip>}
          {isActiveVersion ? <Chip tone="good">Active</Chip> : <Chip>Older version (read only)</Chip>}
        </div>
        <p className="mt-1 text-sm text-[#55565a]">{copy.blurb}</p>
        {sourceNote && <p className="mt-1 text-xs text-[#77787b]">{sourceNote}</p>}
      </header>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold">
          Version
          <select value={viewing} onChange={(e) => setViewing(Number(e.target.value))} className={`${inputClass} !w-auto`} aria-label="Version">
            {data.versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} {v.name}
                {v.active ? " (active)" : ""} {v.created_at ? `· ${fmtDateTime(v.created_at)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-[220px] flex-1 gap-1 text-xs font-semibold">
          Template name
          <input value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} className={inputClass} aria-label="Template name" />
        </label>
      </div>
      {!canEdit && <p className="text-xs font-semibold text-[#8a5a00]">Only an admin can change templates. You can read them.</p>}
      {canEdit && !isActiveVersion && <p className="text-xs text-[#55565a]">This is an older version. Switch to the active version to edit; saving always creates a new version and keeps every answer already recorded readable.</p>}
      {version.isLoading && !isActiveVersion ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="grid gap-2">
          {items.map((it, index) => (
            <ItemCard
              key={it.uid}
              item={it}
              index={index}
              count={items.length}
              others={items.filter((o) => o.uid !== it.uid)}
              readOnly={readOnly}
              kind={kind}
              onChange={(p) => patch(it.uid, p)}
              onMove={(d) => setItems((list) => moveItem(list, index, d))}
              onRemove={() => setItems((list) => removeItem(list, index))}
            />
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setItems((list) => [...list, blankItem(kind, list)])} className={buttonClass}>
            <Plus size={14} /> Add item
          </button>
          <button type="button" disabled={save.isPending} onClick={submit} className={primaryButtonClass} data-testid={`save-${kind}`}>
            {save.isPending ? "Saving..." : `Save as version ${data.versions.reduce((m, v) => Math.max(m, v.version), 0) + 1}`}
          </button>
          <span className="text-xs text-[#77787b]">{outstanding} items</span>
        </div>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="border border-[#f0c4c7] bg-[#fff1f2] p-3 text-sm text-[#86000B]">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {save.isError && <ErrorNote error={save.error} />}
    </section>
  );
}

export default function SettingsTab() {
  const { isAdmin, loaded } = useSessionRole();
  const templates = useQuery({ queryKey: ["overview-templates"], queryFn: () => overviewApi.getTemplates() });
  if (templates.isLoading || !loaded) return <Skeleton className="h-48" />;
  if (templates.isError || !templates.data) return <ErrorNote error={templates.error} onRetry={() => void templates.refetch()} />;
  return (
    <div className="grid gap-4" data-testid="settings-tab">
      <TemplateEditor key={`a-${templates.data.acknowledge_checklist.active.version}`} kind="acknowledge_checklist" data={templates.data.acknowledge_checklist} canEdit={isAdmin} />
      <TemplateEditor key={`d-${templates.data.delivery_checkout.active.version}`} kind="delivery_checkout" data={templates.data.delivery_checkout} canEdit={isAdmin} />
    </div>
  );
}
