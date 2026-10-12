import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as adminApi from "@/services/api/admin";
import * as dispatchApi from "@/services/api/dispatch";
import { CREATABLE_ROLES, needsStaffLink, staffOptionsFor, validateNewUser, type CreatableRoleValue } from "@/lib/userForm";
import { errorInfo } from "@/lib/officer";

const field = "w-full border border-[#d8d7d2] bg-white px-3 py-2 text-sm outline-none focus:border-black";

export default function AddUserForm({
  existingUsers,
  onCreated,
  onCancel,
}: {
  existingUsers: adminApi.ApiUser[];
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

  const staff = useQuery({ queryKey: ["dispatch-staff-all"], queryFn: () => dispatchApi.listStaff(), staleTime: 10 * 60_000, retry: 1, enabled: needsStaffLink(role) });
  const options = useMemo(
    () => staffOptionsFor(role, staff.data ?? [], existingUsers.map((u) => u.staff_id)),
    [role, staff.data, existingUsers],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problems = validateNewUser({ full_name: fullName, email, phone, role, password });
    setErrors(problems);
    if (problems.length > 0) return;
    setSaving(true);
    try {
      const body: adminApi.CreateUserBody = { full_name: fullName.trim(), email: email.trim(), phone: phone.trim() || null, role };
      if (needsStaffLink(role) && staffId) body.staff_id = Number.isNaN(Number(staffId)) ? staffId : Number(staffId);
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
          Phone
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
            Staff record ({role === "driver" ? "drivers" : "helpers"} not yet linked)
            <select
              value={staffId}
              onChange={(e) => {
                const value = e.target.value;
                setStaffId(value);
                const selected = options.find((s) => String(s.id) === value);
                if (selected) {
                  setFullName(selected.name ?? "");
                  setEmail(selected.email ?? "");
                  setPhone(selected.phone ?? "");
                }
              }}
              className={field}
              disabled={staff.isLoading}
            >
              <option value="">{staff.isLoading ? "Loading staff..." : "No staff link"}</option>
              {options.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>
                  {s.name} · {s.title || "Staff"} · {s.warehouse || "No warehouse"} · {s.email || "No email"} · {s.phone || "No phone"}
                </option>
              ))}
            </select>
            {staff.isError && <span className="font-normal text-[#86000B]">Could not load staff. You can link it later.</span>}
            {!staffId && !staff.isLoading && <span className="font-normal text-[#77787b]">Without a staff link this person will see no assignments.</span>}
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
