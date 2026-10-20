import { useState } from "react";
import * as adminApi from "@/services/api/admin";

export default function EditUserForm({
  user,
  onSaved,
  onCancel,
}: {
  user: adminApi.ApiUser;
  onSaved: (user: adminApi.ApiUser, reset: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [status, setStatus] = useState(user.status ?? "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = "border border-[#d8d7d2] bg-white px-3 py-2 text-sm";
  return (
    <form
      className="grid gap-3 border border-[#d8d7d2] bg-white p-4"
      data-testid="edit-user-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const result = await adminApi.editUser(user.id, {
            full_name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            status,
          });
          onSaved(result, result.password_reset_required);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "Could not save account.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong>Edit existing account</strong>
      <p className="text-sm">
        Role: {user.role}. Staff record: {user.staff_id ?? "None"}. Staff links
        and trip history are preserved.
      </p>
      <label className="grid gap-1 text-sm">
        Full name
        <input
          className={field}
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Email
        <input
          className={field}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Phone (optional)
        <input
          className={field}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Status
        <select
          className={field}
          value={status}
          onChange={(e) => setStatus(e.target.value as "active" | "disabled")}
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </label>
      <p className="text-sm">
        Changing the email invalidates the old password and invitation links.
        Use Copy invite link or Reset password after saving to set a new
        password.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          className="bg-black px-4 py-2 text-white disabled:opacity-40"
          disabled={busy}
        >
          {busy ? "Saving..." : "Save account"}
        </button>
        <button
          type="button"
          className={field}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
