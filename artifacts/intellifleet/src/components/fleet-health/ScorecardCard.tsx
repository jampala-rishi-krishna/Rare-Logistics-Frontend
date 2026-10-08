import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, MessageCircle, PauseCircle, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import * as fh from "@/services/api/fleetHealth";
import type { ScorecardItem, ScorecardResponse } from "@/services/api/fleetHealth";
import { TONES, ecoBandFor, ecoTone, formatDateTime, initials, scorecardHeadline, scorecardStatus, weekRangeLabel, type FleetPermissions } from "@/lib/fleetHealth";
import { ConfirmDialog } from "./Modal";
import { Banner, Card, EmptyState, ErrorPanel, Pill, SectionHead, Sk, cx } from "./ui";
import { errorMessage, fhKeys, invalidateFleetHealth } from "./hooks";

function Bubble({ item }: { item: ScorecardItem }) {
  if (!item.message) {
    return (
      <div className="max-w-[88%] rounded-[8px] rounded-tl-none border border-dashed border-[#c9c8c4] bg-white/60 px-3 py-2.5 text-[13px] italic text-[#77787b]">
        No message will be written: {item.skip_reason ?? "not enough data this week"}.
      </div>
    );
  }
  return (
    <div className={cx("relative max-w-[92%] rounded-[8px] rounded-tr-none px-3 pb-5 pt-2.5 text-[13.5px] leading-[1.45] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]", item.will_send ? "bg-[#d9fdd3]" : "bg-white")}>
      <p className="whitespace-pre-wrap break-words" data-testid="fh-wa-message">{item.message}</p>
      <span className="absolute bottom-1 right-2 flex items-center gap-1 text-[10.5px] text-[#667781]">
        Mon 08:00
        <CheckCheck size={13} className={item.will_send ? "text-[#53bdeb]" : "text-[#9aa5ab]"} aria-hidden />
      </span>
    </div>
  );
}

function PreviewRow({ item }: { item: ScorecardItem }) {
  const status = scorecardStatus(item);
  const tone = TONES[ecoTone(ecoBandFor(item.score))];
  return (
    <li className="grid gap-3 border-b border-[#efeeeb] px-4 py-4 last:border-0 md:grid-cols-[230px_1fr] md:gap-6 md:px-5" data-testid={`fh-preview-${item.staff_id}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0b0b0b] text-[13px] font-semibold text-white" aria-hidden>
          {initials(item.name)}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{item.name}</div>
          <div className="mono mt-1 truncate text-[11px] text-[#77787b]">{item.trucks.join(" · ") || "No truck"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.score != null ? (
              <span className="inline-flex items-center gap-1 border px-1.5 py-0.5 text-xs font-bold" style={{ color: tone.fg, background: tone.bg, borderColor: tone.border }}>
                <span className="mono">{item.score}</span>
                <span className="text-[10px] font-semibold">/100</span>
              </span>
            ) : (
              <Pill tone="none" dashed>No score</Pill>
            )}
            <Pill tone={status.tone} icon={item.will_send ? Send : undefined}>{status.label}</Pill>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 items-start">
        <Bubble item={item} />
      </div>
    </li>
  );
}

export function ScorecardCard({ data, loading, error, onRetry, perms, week }: { data: ScorecardResponse | undefined; loading: boolean; error: unknown; onRetry: () => void; perms: FleetPermissions; week: string | undefined }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => fh.setScorecardEnabled(enabled),
    onSuccess: (sw) => {
      qc.setQueryData(fhKeys.scorecard(week), (old: ScorecardResponse | undefined) => (old ? { ...old, switch: { ...old.switch, ...sw } } : old));
      invalidateFleetHealth(qc, "scorecard");
      setConfirming(false);
    },
  });
  const sw = data?.switch;
  const head = sw ? scorecardHeadline(sw) : null;
  const items = data?.preview.items ?? [];
  const willSend = data?.preview.will_send_count ?? 0;
  return (
    <Card className="entrance entrance-3" data-testid="fh-scorecard">
      <div className="border-b border-[#e4e3df] p-4 md:px-5">
        <SectionHead eyebrow="WhatsApp" title="Weekly eco scorecard" info={["Every Monday 08:00 (Manila), each scored driver gets their eco score by WhatsApp with one tip.", "Nothing is sent while the switch is off or WhatsApp messages are paused."]} />
      </div>

      {loading ? (
        <div className="grid gap-4 p-5"><Sk className="h-16 w-full" /><Sk className="h-40 w-full" /></div>
      ) : error || !sw ? (
        <ErrorPanel error={error} onRetry={onRetry} title="Could not load the scorecard" className="m-4" />
      ) : (
        <>
          <div className="grid gap-4 border-b border-[#e4e3df] p-4 md:grid-cols-[1fr_auto] md:items-center md:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="micro text-[#77787b]">Weekly WhatsApp scores</span>
                <Pill tone={head!.tone}>{head!.label}</Pill>
              </div>
              <p className="mt-2 text-[13px] leading-5 text-[#55565a]">
                Schedule: <strong className="text-black">{sw.schedule}</strong>. {head!.detail}
              </p>
              {sw.changed_by && <p className="mt-1 text-xs text-[#77787b]">Last changed by {sw.changed_by}{sw.changed_at ? `, ${formatDateTime(sw.changed_at)}` : ""}.</p>}
              {!perms.isAdmin && <p className="mt-1 text-xs text-[#77787b]">Only an admin can change this.</p>}
            </div>
            {perms.isAdmin && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-[#d8d7d2] bg-white px-4 py-2.5">
                <span className="text-sm font-semibold">{sw.enabled ? "On" : "Off"}</span>
                <Switch
                  checked={sw.enabled}
                  disabled={toggle.isPending}
                  aria-label="Send weekly eco scorecard by WhatsApp"
                  data-testid="fh-scorecard-switch"
                  onCheckedChange={(next) => {
                    if (next) setConfirming(true);
                    else toggle.mutate(false);
                  }}
                />
              </label>
            )}
          </div>
          {toggle.isError && !confirming && <div className="px-5 pt-4 text-[13px] text-[#a32720]">{errorMessage(toggle.error)}</div>}
          {!sw.whatsapp_active && (
            <div className="px-4 pt-4 md:px-5">
              <Banner tone="soon" icon={PauseCircle}>WhatsApp messages are paused platform-wide. {sw.enabled ? "The scorecard is on but nothing will be sent until WhatsApp is resumed." : "Turning the scorecard on will not send anything until WhatsApp is resumed."}</Banner>
            </div>
          )}

          <div className="mt-4 border-t border-[#e4e3df]">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#fafaf8] px-4 py-3 md:px-5">
              <div>
                <div className="micro text-[#77787b]">Preview, nothing is sent</div>
                <div className="mt-1 text-[13px] text-[#55565a]">Week {data ? weekRangeLabel(data.preview.week_start, data.preview.week_end) : ""}</div>
              </div>
              <span className="text-[13px] text-[#55565a]"><strong className="mono text-black">{willSend}</strong> of {items.length} would be sent</span>
            </div>
            {items.length === 0 ? (
              <EmptyState icon={MessageCircle} title="No drivers to message" body="Drivers appear here once they have assigned driving in the week." compact />
            ) : (
              <ul className="bg-[#efeae2] bg-[radial-gradient(rgba(11,20,26,.045)_1px,transparent_1px)] [background-size:14px_14px]">
                {items.map((i) => (
                  <PreviewRow key={i.staff_id} item={i} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Turn on weekly scorecards?"
        body="Drivers will receive their weekly eco score by WhatsApp every Monday 08:00. Continue?"
        confirmLabel="Turn on"
        busy={toggle.isPending}
        error={toggle.isError ? errorMessage(toggle.error) : null}
        onConfirm={() => toggle.mutate(true)}
      />
    </Card>
  );
}
