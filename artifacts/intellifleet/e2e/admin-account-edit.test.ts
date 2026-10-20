import assert from "node:assert/strict";
import { test } from "node:test";
import { launch, startServer, stopServer, BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";

test("admin can recover a linked test account instead of creating a duplicate", async () => {
  await startServer();
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await installMocks(page, { role: "admin" });
    let user = { id: 17, full_name: "Bryan Test", email: "helper.bryan@example.test", phone: null, role: "helper", status: "disabled", staff_id: 19, invite_state: "none" };
    let writes = 0;
    const headers = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,PATCH,OPTIONS"};
    await page.route("http://mock-api.test/users", route => route.fulfill({contentType: "application/json", headers, body: JSON.stringify([user])}));
    await page.route("http://mock-api.test/api/admin/staff-options**", route => route.fulfill({contentType: "application/json", headers, body: JSON.stringify([{staff_id: 19, name: "Bryan Test", linked_user_id: 17}])}));
    await page.route("http://mock-api.test/api/admin/users/17", route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({status:204, headers});
      assert.equal(route.request().method(), "PATCH"); writes++;
      const body = route.request().postDataJSON();
      assert.equal(body.email, "bryan@example.test"); assert.equal(body.status, "active");
      assert.equal(body.staff_id, undefined); assert.equal(body.role, undefined);
      user = {...user, ...body};
      return route.fulfill({contentType:"application/json", headers, body:JSON.stringify({...user,password_reset_required:true})});
    });
    await page.goto(`${BASE}/admin/users`);
    await page.getByTestId("users-add-button").click();
    await page.getByTestId("add-user-form").getByRole("combobox").first().selectOption("helper");
    await page.getByTestId("add-user-form").getByLabel("Full name", {exact:true}).fill("Bryan");
    await page.getByRole("button", {name:"Edit existing account",exact:true}).click();
    const form = page.getByTestId("edit-user-form");
    await form.getByLabel("Email",{exact:true}).fill("bryan@example.test");
    await form.getByRole("combobox").selectOption("active");
    await form.getByRole("button",{name:"Save account",exact:true}).click();
    await page.getByTestId("users-action-message").getByText(/Set a new password/).waitFor();
    const row = page.getByTestId("user-row-17");
    await row.getByText("bryan@example.test",{exact:true}).waitFor();
    assert.equal(writes,1);
    assert.ok((await row.innerText()).includes("19"));
  } finally { await browser.close(); stopServer(); }
});
