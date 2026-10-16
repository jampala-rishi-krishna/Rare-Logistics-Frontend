// Pure crew helpers for the helper / driver app (no React, no import.meta): who the signed-in person can call,
// which role the viewer has, the "already done by" notice, and the Load Planning one-helper-per-truck rule.

export type CrewRole = "driver" | "helper";

export interface CrewPerson {
  id: string;
  name: string;
  phone: string | null;
}

export interface NormalizedCrew {
  driver: CrewPerson | null;
  helpers: CrewPerson[];
}

type RawPerson = { staff_id?: number | string | null; id?: number | string | null; name?: string | null; phone?: string | null; role?: string | null };
// New contract shape {driver, helpers}, the older array of {id, name, role, phone}, or nothing.
export type RawCrew = { driver?: RawPerson | null; helpers?: RawPerson[] | null } | RawPerson[] | null | undefined;

function person(p: RawPerson | null | undefined): CrewPerson | null {
  if (!p || !p.name) return null;
  const id = p.staff_id ?? p.id;
  return { id: id === null || id === undefined ? "" : String(id), name: String(p.name), phone: p.phone ? String(p.phone) : null };
}

/** Crew of a trip in one shape. `fallbackHelpers` is the old `batch.helpers` list (used when no crew is sent). */
export function normalizeCrew(crew: RawCrew, fallbackHelpers?: RawPerson[] | null): NormalizedCrew {
  if (Array.isArray(crew) && crew.length > 0) {
    const driver = person(crew.find((p) => (p.role ?? "").toLowerCase() === "driver"));
    const helpers = crew.filter((p) => (p.role ?? "").toLowerCase() !== "driver").map(person).filter((p): p is CrewPerson => p !== null);
    return { driver, helpers };
  }
  if (crew && !Array.isArray(crew) && (crew.driver || (crew.helpers && crew.helpers.length))) {
    return { driver: person(crew.driver), helpers: (crew.helpers ?? []).map(person).filter((p): p is CrewPerson => p !== null) };
  }
  return { driver: null, helpers: (fallbackHelpers ?? []).map(person).filter((p): p is CrewPerson => p !== null) };
}

/** Role of the signed-in person: viewer_role (contract) first, then the older `role`; the app is for helpers by default. */
export function viewerRoleOf(...sources: Array<{ viewer_role?: string | null; role?: string | null } | null | undefined>): CrewRole {
  for (const s of sources) if (s?.viewer_role === "driver" || s?.viewer_role === "helper") return s.viewer_role;
  for (const s of sources) if (s?.role === "driver" || s?.role === "helper") return s.role;
  return "helper";
}

export interface CrewCall {
  key: string;
  /** call_driver -> "Call driver"; call_helper -> "Call <name>". */
  kind: "call_driver" | "call_helper";
  role: CrewRole;
  name: string;
  phone: string | null;
}

/**
 * Crew members the viewer can call (the viewer themself is never listed).
 * Helper viewer: the driver ("Call driver") plus any other helper. Driver viewer: the helper(s).
 * When the viewer's own id is unknown and there is only one helper, a helper viewer is assumed to be that helper.
 */
export function crewCalls(crew: NormalizedCrew, viewerRole: CrewRole, viewerIds: ReadonlyArray<string | number | null | undefined> = []): CrewCall[] {
  const mine = new Set(viewerIds.filter((v) => v !== null && v !== undefined && v !== "").map(String));
  const isMe = (p: CrewPerson) => p.id !== "" && mine.has(p.id);
  const calls: CrewCall[] = [];
  if (viewerRole === "helper" && crew.driver && !isMe(crew.driver))
    calls.push({ key: `driver-${crew.driver.id || crew.driver.name}`, kind: "call_driver", role: "driver", name: crew.driver.name, phone: crew.driver.phone });
  let helpers = crew.helpers.filter((h) => !isMe(h));
  if (viewerRole === "helper" && helpers.length === crew.helpers.length && crew.helpers.length === 1) helpers = [];
  for (const h of helpers) calls.push({ key: `helper-${h.id || h.name}`, kind: "call_helper", role: "helper", name: h.name, phone: h.phone });
  return calls;
}

/** done_by is a plain name in the new contract and {name, at} in older responses. */
export function doneByParts(doneBy: string | { name?: string | null; at?: string | null } | null | undefined): { name: string; at: string | null } {
  if (!doneBy) return { name: "", at: null };
  if (typeof doneBy === "string") return { name: doneBy, at: null };
  return { name: doneBy.name ?? "", at: doneBy.at ?? null };
}

/** English notice for an already_done answer ("Already done by Ana"); null when the action was not a duplicate. */
export function alreadyDoneNotice(response: { already_done?: boolean | null; done_by?: string | { name?: string | null } | null } | null | undefined): string | null {
  if (!response?.already_done) return null;
  const { name } = doneByParts(response.done_by);
  return name ? `Already done by ${name}` : "Already done";
}

// ---- Load Planning: one truck = one driver + one helper ----

export const MAX_HELPERS_PER_TRUCK = 1;

/** Tapping a helper selects only that helper; tapping the selected one clears it. */
export function toggleSingleHelper(current: readonly number[], helperId: number): number[] {
  return current.includes(helperId) ? [] : [helperId];
}
