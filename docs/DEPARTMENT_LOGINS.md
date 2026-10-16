# Department logins

Each department uses its own shared login, separate from the admin account:

| Department | Login email | Stored role |
|---|---|---|
| Sales | sales@rgf.com | sales |
| Wet Market | wetmarket@rgf.com | wet_market |

Selecting the department on the login screen fills its email and clears any
previously entered password. Authentication and permissions still come from the
backend account, not the selected button. These accounts have no manager or admin
permissions and use the existing Sales/Wet Market access rules.

Passwords are generated separately and must never be committed or embedded in
frontend code. The admin can manage these accounts in Admin > Users.

To provision a new environment, use the backend's manual API-only helper:

```powershell
backend/venv/Scripts/python.exe backend/scripts/provision_department_logins.py
backend/venv/Scripts/python.exe backend/scripts/provision_department_logins.py --apply --base-url https://YOUR-BACKEND --credentials-file backend/.cache/department-logins.json
```

The helper loads `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `backend/.env`,
uses the existing login/list/create-user endpoints, and verifies the new logins.
It sends no emails and never resets an existing account. Keep the generated
credentials file private; `backend/.cache/` is ignored by Git. No schema changes,
direct database access, startup provisioning, or new database paths are added.
