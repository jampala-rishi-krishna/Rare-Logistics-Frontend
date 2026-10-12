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
  type EditorItem,
  type TemplateKindId,
} from "@/lib/overview";
import { errorInfo } from "@/lib/officer";
import { Chip, Empty, ErrorNote, buttonClass, fmtDateTime, inputClass, primaryButtonClass, useSessionRole } from "./shared";

const KIND_LABEL: Record<TemplateKindId, string> = {
  acknowledge_checklist: "Acknowledge checklist",
  delivery_checkout: "Delivery checkout form",
};

function ReadOnlyItems({ items }: { items: overviewApi.TemplateItem[] }) {
  return (
    <ol className="grid gap-2">
      {items.map((it, i) => (
        <li key={it.key + i} className="border border-[#e4e3df] bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{it.label}</span>
            <Chip>{it.item_type}</Chip>
            {it.required && <Chip tone="warn">required</Chip>}
            {it.active === false && <Chip tone="bad">inactive</Chip>}
          </div>
          <div className="mt-1 font-mono text-xs text-[#77787b]">{it.key}</div>
          {it.options && it.options.length > 0 && <div className="mt-1 text-xs">Options: {it.options.join(", ")}</div>}
          {it.show_when && (
            <div className="mt-1 text-xs">
              Shown when <span className="font-mono">{it.show_when.key}</span> is {it.show_when.in.map(String).join(" / ")}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function ItemEditor({
  kind,
  item,
  index,
  total,
  allKeys,
  errors,
  onChange,
  onLabel,
  onMove,
  onRemove,
}: {
  kind: TemplateKindId;
  item: EditorItem;
  index: number;
  total: number;
  allKeys: string[];
  errors: string[];
  onChange: (patch: Partial<EditorItem>) => void;
  onLabel: (label: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const otherKeys = allKeys.filter((k) => k !== item.key);
  return (
    <li className={`grid gap-3 border bg-white p-3 ${errors.length ? "border-[#e6b4b7]" : "border-[#e4e3df]"}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <label className="grid gap-1 text-xs font-semibold">
          Label
          <input value={item.label} onChange={(e) => onLabel(e.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Type
          <select value={item.item_type} onChange={(e) => onChange({ item_type: e.target.value })} className={inputClass}>
            {ITEM_TYPES[kind].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-mono text-xs text-[#77787b]" title={item.keyLocked ? "Key of a saved item stays fixed" : "Generated from the label"}>
          key: {item.key}
        </span>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={item.required} onChange={(e) => onChange({ required: e.target.checked })} /> Required
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={item.active} onChange={(e) => onChange({ active: e.target.checked })} /> Active
        </label>
      </div>
      {needsOptions(item.item_type) && (
        <label className="grid gap-1 text-xs font-semibold">
          Options (comma or line separated)
          <textarea rows={2} value={item.optionsText} onChange={(e) => onChange({ optionsText: e.target.value })} className={`${inputClass} py-1.5 font-normal`} />
        </label>
      )}
      {kind === "delivery_checkout" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold">
            Show only when item
            <select value={item.showWhenKey} onChange={(e) => onChange({ showWhenKey: e.target.value })} className={inputClass}>
              <option value="">Always shown</option>
              {otherKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          {item.showWhenKey && (
            <label className="grid gap-1 text-xs font-semibold">
              has one of these values
              <input value={item.showWhenIn} onChange={(e) => onChange({ showWhenIn: e.target.value })} className={inputClass} placeholder="Failed, Returned" />
            </label>
          )}
        </div>
      )}
      {errors.map((m) => (
        <div key={m} className="text-xs text-[#86000B]">
          {m}
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" className={buttonClass} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
          <ArrowUp size={14} />
        </button>
        <button type="button" className={buttonClass} disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">
          <ArrowDown size={14} />
        </button>
        <button type="button" className={`${buttonClass} ml-auto text-[#86000B]`} onClick={onRemove} aria-label="Remove item">
          <Trash2 size={14} />
          Remove
        </button>
      </div>
    </li>
  );
}

function KindPanel({ kind, data, canEdit }: { kind: TemplateKindId; data: { active: overviewApi.Template; versions: overviewApi.TemplateVersionInfo[] }; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const active = data.active;
  const [name, setName] = useState(active.name);
  const [items, setItems] = useState<EditorItem[]>(() => toEditorItems(active.items));
  const [showErrors, setShowErrors] = useState(false);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    setName(active.name);
    setItems(toEditorItems(active.items));
    setShowErrors(false);
  }, [active.id, active.version]);

  const errors = useMemo(() => validateTemplate(kind, name, items), [kind, name, items]);
  const errorsFor = (uid: string) => (showErrors ? errors.filter((e) => e.uid === uid).map((e) => e.message) : []);
  const generalErrors = showErrors ? errors.filter((e) => e.uid === null) : [];

  const older = useQuery({
    queryKey: ["driver-overview", "template-version", kind, viewVersion],
    queryFn: () => overviewApi.getTemplateVersion(kind, viewVersion as number),
    enabled: viewVersion !== null,
    retry: 1,
  });

  const save = useMutation({
    mutationFn: () => overviewApi.saveTemplate(kind, buildTemplatePayload(kind, name, items)),
    onSuccess: async (t) => {
      setMessage({ tone: "good", text: `Saved as version ${t.version}. It is now the active checklist.` });
      await queryClient.invalidateQueries({ queryKey: ["driver-overview", "templates"] });
    },
    onError: (e) => setMessage({ tone: "bad", text: errorInfo(e).message }),
  });

  const onSave = () => {
    setMessage(null);
    setShowErrors(true);
    if (errors.length > 0) return;
    save.mutate();
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 border border-[#e4e3df] bg-white p-3">
        <span className="font-semibold">{active.name}</span>
        <Chip tone="info">v{active.version}</Chip>
        {active.is_draft && <Chip tone="warn">{DRAFT_BADGE_TEXT}</Chip>}
      </div>

      {message && (
        <div role="status" className={`border px-3 py-2 text-sm ${message.tone === "good" ? "border-[#cddfd2] bg-[#edf6f0] text-[#1e7b44]" : "border-[#f0c4c7] bg-[#fff1f2] text-[#86000B]"}`}>
          {message.text}
        </div>
      )}

      {canEdit ? (
        <section className="grid gap-3">
          <label className="grid max-w-[420px] gap-1 text-xs font-semibold">
            Template name
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          {generalErrors.map((e) => (
            <div key={e.message} className="text-xs text-[#86000B]">
              {e.message}
            </div>
          ))}
          <ol className="grid gap-3">
            {items.map((it, i) => (
              <ItemEditor
                key={it.uid}
                kind={kind}
                item={it}
                index={i}
                total={items.length}
                allKeys={items.map((x) => x.key)}
                errors={errorsFor(it.uid)}
                onChange={(patch) => setItems((prev) => prev.map((x) => (x.uid === it.uid ? { ...x, ...patch } : x)))}
                onLabel={(label) => setItems((prev) => relabel(prev, it.uid, label))}
                onMove={(dir) => setItems((prev) => moveItem(prev, i, dir))}
                onRemove={() => setItems((prev) => removeItem(prev, i))}
              />
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => setItems((prev) => [...prev, blankItem(kind, prev)])}>
              <Plus size={14} />
              Add item
            </button>
            <button type="button" className={primaryButtonClass} disabled={save.isPending} onClick={onSave} data-testid="template-save">
              {save.isPending ? "Saving..." : "Save as new version"}
            </button>
            <button type="button" className={buttonClass} onClick={() => { setName(active.name); setItems(toEditorItems(active.items)); setShowErrors(false); setMessage(null); }}>
              Discard changes
            </button>
          </div>
        </section>
      ) : (
        <section className="grid gap-2">
          <div className="text-xs text-[#77787b]">Read-only. Only admins can edit checklists.</div>
          <ReadOnlyItems items={active.items} />
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-sm font-bold">Version history</h3>
        <ul className="grid gap-1">
          {data.versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center gap-2 border border-[#e4e3df] bg-white px-3 py-2 text-sm">
              <span className="font-semibold">v{v.version}</span>
              <span className="min-w-0 break-words">{v.name}</span>
              {v.active && <Chip tone="good">active</Chip>}
              {v.is_draft && <Chip tone="warn">draft</Chip>}
              <span className="text-xs text-[#77787b]">{fmtDateTime(v.created_at)}</span>
              <button type="button" className="ml-auto text-xs font-semibold underline" onClick={() => setViewVersion(viewVersion === v.version ? null : v.version)}>
                {viewVersion === v.version ? "Hide" : "View"}
              </button>
            </li>
          ))}
        </ul>
        {viewVersion !== null &&
          (older.isLoading ? (
            <Empty>Loading version...</Empty>
          ) : older.isError ? (
            <ErrorNote error={older.error} />
          ) : older.data ? (
            <div className="grid gap-2">
              <div className="text-xs text-[#77787b]">Version {older.data.version} (read-only)</div>
              <ReadOnlyItems items={older.data.items} />
              {canEdit && (
                <button
                  type="button"
                  className={`${buttonClass} w-fit`}
                  onClick={() => {
                    setName(older.data!.name);
                    setItems(toEditorItems(older.data!.items));
                    setShowErrors(false);
                  }}
                >
                  Copy into editor
                </button>
              )}
            </div>
          ) : null)}
      </section>
    </div>
  );
}

export default function ChecklistTab() {
  const { isAdmin } = useSessionRole();
  const [kind, setKind] = useState<TemplateKindId>("acknowledge_checklist");
  const query = useQuery({ queryKey: ["driver-overview", "templates"], queryFn: () => overviewApi.getTemplates(), retry: 1 });
  if (query.isLoading) return <Empty>Loading checklists...</Empty>;
  if (query.isError) return <ErrorNote error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return <Empty>No checklists found.</Empty>;
  return (
    <div className="grid gap-4">
      <div className="flex gap-2" role="tablist">
        {(Object.keys(KIND_LABEL) as TemplateKindId[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`min-h-[38px] border px-3 text-sm font-semibold ${kind === k ? "border-black bg-black text-white" : "border-[#d8d7d2] bg-white"}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <KindPanel key={kind} kind={kind} data={data[kind]} canEdit={isAdmin} />
    </div>
  );
}
