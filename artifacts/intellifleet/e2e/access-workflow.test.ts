import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import type { Browser } from "playwright";
import { launch, startServer, stopServer, BASE, shot } from "./harness.ts";
import { installMocks } from "./mockApi.ts";

let browser: Browser;
before(async () => {await startServer(); browser=await launch();});
after(async () => {await browser?.close(); stopServer();});
const order={id:"one",salesorder_number:"SO26-18449",customer_name:"Fresh Foods",order_status:"confirmed",expected_shipment_date:"2026-10-17",shipping_address:{address:"1 Farm Road",city:"Lipa"},assignment_status:"assigned",vehicle_id:"TRK1",driver_name:"Juan",assigned_by:1,assigned_by_name:"Paulo Guevarra",assigned_at:"2026-10-16T06:00:00Z",products:[{name:"Pork",sku:"P1",quantity:12,unit:"kg",total_weight_kg:12}],total:1200};

async function open(role: string, manager=false, identity={fullName:"Test User",email:"test@example.test"}) {
  const context=await browser.newContext({viewport:{width:1440,height:950},timezoneId:"Asia/Manila"});
  const page=await context.newPage();
  const recorder=await installMocks(page,{session:{user:{id:1,...identity,role,status:"active",is_manager:manager}},confirmedOrders:{items:[manager ? order : {...order,assigned_by:undefined,assigned_by_name:undefined,assigned_at:undefined}],total:1,page:1,per_page:25,has_more:false,stock_pending:false}});
  const errors: string[]=[]; page.on("pageerror",e=>errors.push(String(e)));
  let requested: unknown;
  await page.route("http://mock-api.test/api/access/**", async route => {
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith("unassign-requests")) requested=route.request().postDataJSON();
    await route.fulfill({contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify(path.endsWith("alerts") ? {items:[],unread_count:0} : {created:1})});
  });
  await page.goto(`${BASE}/app/loads?tab=confirmed&order=SO26-18449&highlight=one`);
  await page.locator("tbody").getByText("Fresh Foods",{exact:true}).first().waitFor();
  return {context,page,errors,recorder,request:()=>requested};
}

test("manager sees attribution last before actions and unassign controls",async()=>{
  const {context,page,errors}=await open("admin",true);
  await page.getByRole("columnheader",{name:"Assigned by",exact:true}).waitFor();
  assert.equal(await page.getByRole("columnheader").last().innerText(),"ACTIONS");
  assert.ok(await page.getByText("Paulo Guevarra",{exact:false}).count());
  assert.equal(await page.getByRole("button",{name:"Edit",exact:true}).count(),1);
  await shot(page,"access-workflow/manager-confirmed");
  assert.deepEqual(errors,[]); await context.close();
});

test("planner requests unassign with required reason and sees only permitted navigation",async()=>{
  const view=await open("planner"); const {page,context,errors}=view;
  assert.equal(await page.getByRole("columnheader",{name:"Assigned by",exact:true}).count(),0);
  assert.equal(await page.getByRole("button",{name:"Edit",exact:true}).count(),0);
  assert.equal(await page.getByRole("link",{name:"Fleet Health",exact:true}).count(),0);
  assert.ok(await page.getByRole("link",{name:"Driver Overview",exact:true}).count());
  await page.getByRole("button",{name:"Request unassign",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Request unassign"});
  assert.equal(await dialog.getByRole("button",{name:"Send request"}).isDisabled(),true);
  await dialog.getByRole("textbox").fill("Wrong truck");
  await dialog.getByRole("button",{name:"Send request"}).click();
  await page.getByText("Unassign request sent to managers.",{exact:true}).waitFor();
  assert.deepEqual(view.request(),{order_ids:["one"],reason:"Wrong truck"});
  assert.deepEqual(errors,[]); await context.close();
});

test("Sales and Wet Market confirmed orders are read-only",async()=>{
  for(const role of ["sales","wet_market"]) {
    const {context,page,errors}=await open(role);
    assert.equal(await page.getByRole("button",{name:"Edit",exact:true}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Unassign",exact:true}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Email",exact:true}).isVisible(),false);
    assert.equal(await page.getByRole("button",{name:"Load Planning",exact:true}).isVisible(),false);
    assert.equal(await page.getByRole("link",{name:"Fleet",exact:true}).count(),0);
    await shot(page,`access-workflow/${role}-confirmed`);
    assert.deepEqual(errors,[]); await context.close();
  }
});

test("manager reviews Pahabol and previews pickup email before sending",async()=>{
  const {context,page,errors}=await open("admin",true);
  let approved=false, sent=false, previewed=false;
  const late={...order,id:"PO:late",salesorder_number:"PO-1026-01705",purchaseorder_number:"PO-1026-01705",vendor_name:"Late Vendor",order_type:"PO",vendor_contact:{person:"Ana",phone:"09171234567"},pickup_state:"pahabol"};
  await page.route("http://mock-api.test/api/pickup/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    let response: unknown={};
    if(path.endsWith("pahabol")) response={items:approved ? [] : [late],details_pending:0};
    else if(path.endsWith("decision")) {approved=true; response={status:"approved"};}
    else if(path.endsWith("preview")) {previewed=true; response={delivery_date:"2026-10-17",preview_token:"reviewed",recipients:{to:["procurement@test.com"],cc:["logistics@test.com"]},scheduled:[{po:"PO-1026-01705",vendor:"Late Vendor",address:"1 Farm Road",contact:"Ana 0917",destination:"Mets",items:[{name:"Pork",qty:12,unit:"kg",kg:12}]}],pahabol:[]};}
    else if(path.endsWith("send")) {assert.ok(previewed); assert.deepEqual(route.request().postDataJSON(),{preview_token:"reviewed"}); sent=true; response={status:"sent"};}
    await route.fulfill({contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify(response)});
  });
  await page.route("http://mock-api.test/api/load-planning/inventory/purchase-orders*",route=>route.fulfill({contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify({items:[],total:0,page:1,has_more:false,details_pending:0})}));
  await page.getByRole("button",{name:"Inventory",exact:true}).click();
  await page.getByTestId("order-kind-PO").click();
  await page.getByRole("button",{name:"Approve",exact:true}).click();
  await page.getByText("Pahabol – needs approval (0)",{exact:true}).waitFor();
  assert.ok(approved);
  await page.getByRole("button",{name:"Send pickup list now",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Preview pickup email"});
  await dialog.getByText("PO-1026-01705 · Late Vendor",{exact:true}).waitFor();
  assert.equal(sent,false);
  await shot(page,"access-workflow/pickup-email-preview");
  await dialog.getByRole("button",{name:"Send email",exact:true}).click();
  await page.getByText("Pickup email: sent",{exact:true}).waitFor();
  assert.ok(sent); assert.deepEqual(errors,[]); await context.close();
});


test("admin profiles use each account identity and reserve the personal photo for the owner",async()=>{
  for(const identity of [
    {fullName:"Jed",email:"jed@rareglobalfood.com",initial:"J",owner:false},
    {fullName:"Paulo Guevarra",email:"pau@rareglobalfood.com",initial:"P",owner:false},
    {fullName:"Admin",email:"admin@rgf.com",initial:"R",owner:true},
  ]) {
    const {context,page,errors}=await open("admin",true,identity);
    const name=identity.owner ? "Rishi" : identity.fullName;
    const sidebar=page.getByTestId("sidebar-profile");
    const header=page.getByRole("button",{name:"Open profile",exact:true});
    assert.ok((await sidebar.innerText()).includes(name));
    assert.equal(await sidebar.getByRole("img",{name:"Rishi"}).count(),identity.owner ? 1 : 0);
    assert.equal(await header.getByRole("img",{name:"Rishi"}).count(),identity.owner ? 1 : 0);
    if(!identity.owner) {
      assert.equal(await header.locator("span").first().innerText(),identity.initial);
      assert.ok((await header.innerText()).includes(name));
    }
    await header.click();
    const dialog=page.getByRole("dialog",{name:"Profile",exact:true});
    await dialog.getByText(name,{exact:true}).waitFor();
    assert.ok((await dialog.innerText()).includes(identity.email));
    assert.equal(await dialog.getByRole("img",{name:"Rishi"}).count(),identity.owner ? 1 : 0);
    assert.equal((await dialog.innerText()).includes("Software Architect"),identity.owner);
    if(!identity.owner) assert.equal(await dialog.locator("span").first().innerText(),identity.initial);
    assert.equal(await dialog.getByText("Role: Admin",{exact:true}).count(),1);
    await shot(page,`access-workflow/profile-${identity.initial.toLowerCase()}`);
    assert.deepEqual(errors,[]); await context.close();
  }
});
