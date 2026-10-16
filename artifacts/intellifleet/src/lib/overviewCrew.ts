// Pure crew helpers for the Driver Overview (dispatcher / admin): who is on a trip (driver + helpers), the
// Driver / Helper board grouping, crew-name search and "Acknowledged by Bryan (Helper) · 07:42" activity lines.
// Tolerates every server shape: crew as an array of {id, name, role, phone}, crew as {driver, helpers} (contract
// 2026-10-16), helpers as plain names or as {staff_id, name, phone}, and the legacy driver_name / driver_id.

export interface OverviewPerson {
  id: number | string | null;
  name: string;
  phone: string | null;
}

export interface OverviewCrew {
  driver: OverviewPerson | null;
  helpers: OverviewPerson[];
}

type RawPerson = { staff_id?: number | string | null; id?: number | string | null; name?: string | null; phone?: string | null; role?: string | null };

export interface CrewRowLike {
  crew?: RawPerson[] | { driver?: RawPerson | null; helpers?: RawPerson[] | null } | null;
  driver_id?: number | string | null;
  driver_name?: string | null;
  helpers?: Array<string | RawPerson | null> | null;
}

function toPerson(p: RawPerson | string | null | undefined): OverviewPerson | null {
  if (!p) return null;
  if (typeof p === "string") return p.trim() ? { id: null, name: p.trim(), phone: null } : null;
  if (!p.name) return null;
  return { id: p.staff_id ?? p.id ?? null, name: String(p.name), phone: p.phone ?? null };
}

const nonNull = <T,>(v: T | null): v is T => v !== null;

/** Driver + helpers of a trip row or trip detail, whatever shape the server sent. */
export function rowCrew(row: CrewRowLike): OverviewCrew {
  const crew = row.crew;
  if (Array.isArray(crew) && crew.length > 0) {
    const isDriver = (p: RawPerson) => (p.role ?? "").toLowerCase() === "driver";
    return { driver: toPerson(crew.find(isDriver)), helpers: crew.filter((p) => !isDriver(p)).map(toPerson).filter(nonNull) };
  }
  if (crew && !Array.isArray(crew) && (crew.driver || (crew.helpers ?? []).length > 0))
    return { driver: toPerson(crew.driver), helpers: (crew.helpers ?? []).map(toPerson).filter(nonNull) };
  return {
    driver: row.driver_name ? { id: row.driver_id ?? null, name: row.driver_name, phone: null } : null,
    helpers: (row.helpers ?? []).map(toPerson).filter(nonNull),
  };
}

/** Flat list, driver first, for call links. */
export function crewList(row: CrewRowLike): Array<OverviewPerson & { role: "driver" | "helper" }> {
  const c = rowCrew(row);
  return [...(c.driver ? [{ ...c.driver, role: "driver" as const }] : []), ...c.helpers.map((h) => ({ ...h, role: "helper" as const }))];
}

export type BoardMode = "driver" | "helper";

export interface CrewGroup<T> {
  key: string;
  label: string;
  person: OverviewPerson | null;
  rows: T[];
}

/**
 * The board listed by driver or by helper. A trip with two helpers appears under each of them. Trips with no
 * driver / helper go last under "No driver" / "No helper". Row order inside a group is kept.
 */
export function groupByCrew<T extends CrewRowLike>(rows: readonly T[], mode: BoardMode): Array<CrewGroup<T>> {
  const groups = new Map<string, CrewGroup<T>>();
  const none = mode === "driver" ? "No driver" : "No helper";
  const add = (person: OverviewPerson | null, row: T) => {
    const key = person ? (person.id !== null && person.id !== undefined ? `id:${person.id}` : `name:${person.name.toLowerCase()}`) : "none";
    let g = groups.get(key);
    if (!g) {
      g = { key, label: person ? person.name : none, person, rows: [] };
      groups.set(key, g);
    }
    if (!g.person?.phone && person?.phone) g.person = person;
    g.rows.push(row);
  };
  for (const row of rows) {
    const c = rowCrew(row);
    if (mode === "driver") add(c.driver, row);
    else if (c.helpers.length === 0) add(null, row);
    else for (const h of c.helpers) add(h, row);
  }
  return [...groups.values()].sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
}

/** Search by driver or helper name (case-insensitive substring). Empty query matches. */
export function matchesCrewSearch(row: CrewRowLike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const c = rowCrew(row);
  return [c.driver, ...c.helpers].some((p) => Boolean(p && p.name.toLowerCase().includes(q)));
}

/** "helper" -> "Helper", "logistics_officer" -> "Logistics officer"; "" when absent. */
export function roleWord(role: unknown): string {
  if (typeof role !== "string" || !role.trim()) return "";
  const t = role.trim().replaceAll("_", " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Bryan San. Antonio (Helper)" from {name, role} or a plain name; "" when there is no name. */
export function personWithRole(by: unknown, role?: unknown): string {
  let name = "";
  let r: unknown = role;
  if (typeof by === "string") name = by;
  else if (by && typeof by === "object") {
    const o = by as { name?: unknown; role?: unknown };
    name = typeof o.name === "string" ? o.name : "";
    if (r === undefined || r === null || r === "") r = o.role;
  }
  name = name.trim();
  if (!name) return "";
  const w = roleWord(r);
  return w ? `${name} (${w})` : name;
}

/**
 * "Acknowledged by Bryan San. Antonio (Helper) · 07:42" from actor_name + actor_role. null when the event has no
 * actor_name, so the caller keeps its older wording. The role is never assumed.
 */
export function actorLine(label: string, event: { actor_name?: unknown; actor_role?: unknown }, time?: string | null): string | null {
  const who = typeof event.actor_name === "string" ? personWithRole(event.actor_name, event.actor_role) : "";
  if (!who) return null;
  return `${label} by ${who}${time && time !== "—" ? ` · ${time}` : ""}`;
}
