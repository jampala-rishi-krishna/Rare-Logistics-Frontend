import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as adminApi from "@/services/api/admin";
import { CREATABLE_ROLES, needsStaffLink, staffPickerEntries, staffRecordError, validateNewUser, type CreatableRoleValue } from "@/lib/userForm";
import { errorInfo } from "@/lib/officer";

const field = "w-full border border-[#d8d7d2] bg-white px-3 py-2 text-sm outline-none focus:border-black";

export default function AddUserForm({
  onCreated,
  existingUsers = [],
  onExisting,
  onCancel,
}: {
  /** Kept for callers; linked-login state now comes from staff-options. */
  existingUsers?: adminApi.ApiUser[];
  onExisting?: (user: adminApi.ApiUser) => void;
  onCreated: (user: adminApi.ApiUser) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<CreatableRoleValue>("driver");
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [sendLoginEmail, setSendLoginEmail] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const staffRole = role === "helper" ? "helper" : "driver";
  const staff = useQuery({ queryKey: ["admin-staff-options", staffRole], queryFn: () => adminApi.getStaffOptions(staffRole), staleTime: 60_000, retry: 1, enabled: needsStaffLink(role) });
  const options = useMemo(() => staff.data ?? [], [staff.data]);
  const entries = useMemo(() => staffPickerEntries(options), [options]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problems = validateNewUser({ full_name: fullName, email, phone, role, password });
    const staffProblem = staffRecordError(role, staffId, options);
    if (staffProblem) problems.push(staffProblem);
    setErrors(problems);
    if (problems.length > 0) return;
    setSaving(true);
    try {
      const body: adminApi.CreateUserBody = { full_name: fullName.trim(), email: email.trim(), phone: phone.trim() || null, role };
      if (needsStaffLink(role)) body.staff_id = Number.isNaN(Number(staffId)) ? staffId : Number(staffId);
      if (password) {
        body.password = password;
        body.send_login_email = sendLoginEmail;
      }
      onCreated(await adminApi.createUser(body));
    } catch (error) {
      setErrors([errorInfo(error).message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 border border-[#d8d7d2] bg-white p-4" data-testid="add-user-form">
      <div className="text-sm font-semibold">Add user</div>
      {needsStaffLink(role) && <div className="text-sm">A driver or helper can have one login per staff record. To replace a test login, edit the existing account below.</div>}
      {onExisting && existingUsers.filter(u => u.role === role && (u.full_name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(fullName.trim().toLowerCase().replace(/[^a-z0-9]/g, "")) || u.email?.toLowerCase() === email.trim().toLowerCase()) && fullName.trim().length > 1).map(u => <div key={u.id} className="border p-3 text-sm">Existing account: {u.full_name} ({u.email}, {u.status}). <button type="button" className="underline" onClick={() => onExisting(u)}>Edit existing account</button></div>)}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">
          Full name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} autoComplete="off" />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="off" />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Phone (optional; email login when blank)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} inputMode="tel" autoComplete="off" />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Role
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as CreatableRoleValue);
              setStaffId("");
            }}
            className={field}
          >
            {CREATABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {needsStaffLink(role) && (
          <label className="grid gap-1 text-xs font-semibold md:col-span-2">
            Staff record (required)
            <select
              data-testid="add-user-staff-record"
              required
              value={staffId}
              onChange={(e) => {
                const value = e.target.value;
                setStaffId(value);
                const selected = options.find((s) => String(s.staff_id) === value);
                if (selected) {
                  setFullName(selected.name ?? "");
                  if (selected.phone) setPhone(selected.phone);
                }
              }}
              className={field}
              disabled={staff.isLoading}
            >
              <option value="" disabled>
                {staff.isLoading ? "Loading staff..." : `Choose a ${role === "helper" ? "helper" : "driver"} staff record`}
              </option>
              {entries.map((s) => (
                <option key={s.value} value={s.value} disabled={s.disabled}>
                  {s.label}
                </option>
              ))}
            </select>
            {staff.isError && <span className="font-normal text-[#86000B]">Could not load staff records. Try again.</span>}
            {!staff.isLoading && !staff.isError && entries.length === 0 && (
              <span className="font-normal text-[#77787b]">No {role === "helper" ? "helper" : "driver"} staff records found.</span>
            )}
          </label>
        )}
        <label className="grid gap-1 text-xs font-semibold md:col-span-2">
          Initial password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
          <span className="font-normal text-[#77787b]">
            Leave blank to require an invite/reset link before this user can log in.
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs font-semibold md:col-span-2">
          <input
            type="checkbox"
            checked={sendLoginEmail}
            disabled={!password}
            onChange={(e) => setSendLoginEmail(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Email login details after creating the user
            <span className="block font-normal text-[#77787b]">
              Sends the login email to this user only, using the email address above.
            </span>
          </span>
        </label>
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="grid gap-1 text-sm text-[#86000B]">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? "Creating..." : "Create user"}
        </button>
        <button type="button" onClick={onCancel} className="border border-[#d8d7d2] px-4 py-2 text-sm font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
