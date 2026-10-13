# MASTER IMPLEMENTATION PROMPT: RARE LOGISTICS DRIVER APPLICATION UPGRADE

## 1. ROLE AND OBJECTIVE

Act as a senior product designer, UX architect, React developer, backend engineer, database engineer, QA engineer, and logistics operations specialist.

Upgrade the existing Rare Global Food Trading Corporation driver application into a professional, production-ready, mobile-first logistics driver application inspired by the simplicity and usability of Uber Driver and established delivery management applications.

Existing application:
https://rare-logistics-frontend.rishi-315.workers.dev/

Current driver page:
`/driver/today`

The current application displays assigned vehicles, order counts, total shipment weight, routes, driver information, helper information, assignment statuses, Today, History, and logout.

Preserve and improve the existing application rather than building a separate application from scratch.

The final application must allow drivers to:

- Log in securely and manage their profiles.
- View and acknowledge dispatch assignments.
- Review assigned vehicles, helpers, routes, and orders.
- Perform vehicle readiness checks.
- Start routes and manage deliveries.
- Navigate to customer locations.
- Update individual order statuses.
- Record delivered, partially delivered, and failed deliveries.
- Capture proof of delivery.
- Report concerns and incidents.
- Contact dispatchers and supervisors.
- Receive important notifications and operational alerts.
- Submit concerns through the existing Zoho Forms integration where available.
- Review delivery history and previously reported issues.
- Handle unreliable mobile connectivity without losing work.
- Log out securely.

The goal is a genuinely functional logistics application, not merely a visual redesign.

---

# 2. NON-NEGOTIABLE REQUIREMENT: PRESERVE THE EXISTING COLOUR THEME

This requirement takes precedence over all visual redesign decisions.

Use the supplied screenshot of the current driver application as the reference for its visual identity.

**Do not change the current colour theme. Change the user experience, not the colours.**

Preserve the existing colours and styling:
- White content backgrounds.
- Existing light-grey page background.
- Existing black and dark text.
- Existing subtle grey borders and dividers.
- Existing yellow/orange assignment status indicators.
- Existing button colours and border treatments.
- Existing visual styling of active and inactive navigation elements.
- Existing colour variables, design tokens, and Tailwind theme configuration.

Before changing styles, inspect the repository to determine the exact colours currently used. Reuse the actual existing CSS variables, design tokens, and component styles instead of estimating new colours from the screenshot.

Do not introduce:
- Uber's branding or logo.
- Uber's colour palette.
- A new red, blue, green, or purple brand theme.
- New decorative gradients.
- Neon colours or glowing effects.
- Glassmorphism.
- Unnecessary colourful dashboards.
- Decorative background illustrations.
- Excessive animation.
- Arbitrary global colour replacements.

Use Uber Driver only as inspiration for layout, information hierarchy, navigation, interaction patterns, and the clarity of its driver workflows.

The application should look like a more refined, mature, professional version of the existing RARE driver application.

Improve the design through:
- Better spacing and alignment.
- Clearer typography and heading hierarchy.
- More useful assignment cards.
- Cleaner information grouping.
- Consistent buttons and form controls.
- Proper mobile navigation.
- Clear delivery timelines.
- Well-designed profile and history pages.
- A professional map-based delivery experience.
- Accessible, easy-to-use controls.

Every new screen must follow the existing colour theme.

---

# 3. FIRST STEP: AUDIT THE EXISTING PROJECT

Before writing code, inspect the existing repository thoroughly.

Identify:

1. Frontend framework and version.
2. Backend framework and version.
3. Frontend routes and page structure.
4. Authentication and session management.
5. Existing API client and API endpoints.
6. Database technology, schemas, and migrations.
7. Driver, helper, vehicle, assignment, route, and order relationships.
8. Existing order and assignment status values.
9. Existing route-planning and mapping integrations.
10. Existing file upload and storage infrastructure.
11. Existing notification and messaging capabilities.
12. Existing Zoho Forms or other Zoho integrations.
13. Existing deployment configuration and environment variables.
14. Existing tests, build scripts, and coding conventions.

Inspect the implementation of `/driver/today`, History, assignment details, and every related driver-facing route.

Trace the entire workflow from the dispatch team assigning an order or route through to the driver acknowledging it, completing delivery, and recording the final result.

Do not assume an endpoint, database field, status, or integration exists until you have verified it.

Produce a concise internal implementation plan identifying the actual files and backend operations that need modification. Then implement the upgrade without stopping at the planning stage.

Do not replace working infrastructure unnecessarily.

---

# 4. INFORMATION ARCHITECTURE

Organise the application around four primary mobile navigation destinations:

1. Home
2. Routes
3. Alerts
4. Profile

Use a clean bottom navigation bar on mobile.

### Home
Today's overview, assignments, next action, active route summary, delivery progress, and important issues.

### Routes
Assigned, acknowledged, active, paused, and completed routes, together with their stops and orders.

### Alerts
Operational notifications, new assignments, urgent concerns, dispatch responses, and issue updates.

### Profile
Driver information, vehicle and helper details, preferences, help, contact information, account security, and logout.

Assignment details, individual order details, proof of delivery, and concern forms should be contextual pages that open from the relevant workflow.

Preserve existing routes and deep links wherever possible. Redirect or migrate routes only when necessary and without breaking existing integrations.

---

# 5. LOGIN, AUTHENTICATION, AND LOGOUT

Improve the existing login experience while retaining the current authentication provider and security model.

Implement or improve:

- Secure login.
- Session restoration where supported.
- Forgot-password functionality if supported.
- Loading and authentication error states.
- Session expiry handling.
- Protected driver routes.
- Authorisation checks on backend requests.
- Secure logout.
- Appropriate clearing of sensitive client-side state after logout.

After successful login, show the authenticated driver's own dashboard.

Do not hardcode driver names, phone numbers, employee IDs, vehicle details, or assignments.

Every driver must see only the information they are authorised to access.

Logout must invalidate or terminate the appropriate session using the existing authentication mechanism. Users must not be able to continue using protected pages after logging out.

---

# 6. DRIVER PROFILE

Create a complete profile page using actual backend data.

Display, when available:

- Driver photograph.
- Full name.
- Driver or employee ID.
- Registered phone number.
- Email address.
- Assigned depot or operational location.
- Current duty status.
- Assigned vehicle registration.
- Assigned helper and relevant contact details.
- Relevant licence or document expiry information, if maintained by the company.

Provide appropriate sections for:

- Personal information.
- Vehicle and helper information.
- Account security.
- Notification preferences.
- Help and support.
- Privacy information.
- Application version.
- Logout.

Only allow editing of fields the driver is authorised to change.

Changes to driver-controlled information must be validated and saved through the backend.

Do not allow drivers to change dispatch-controlled assignments, vehicle ownership, employment identifiers, or other restricted information.

---

# 7. REDESIGN THE HOME / TODAY DASHBOARD

Transform `/driver/today` into a polished, information-rich but uncluttered driver dashboard.

## Header

Display:
- Personalised greeting.
- Current local date.
- Driver duty status when available.
- Notification icon and unread count.
- Access to the profile.

Keep the header compact and mobile-friendly.

## Today's summary

Show useful operational metrics:

- Assigned orders.
- Completed orders.
- Remaining orders.
- Active routes.
- Orders requiring attention.

Only display metrics supported by actual data. Do not invent figures.

## Assignment cards

Each card should show:

- Assignment or route ID.
- Vehicle registration.
- Assignment status.
- Route origin and destination.
- Number of orders.
- Total shipment weight and correct unit.
- Pack count when available.
- Planned departure or delivery window when available.
- Relevant driver and helper details.
- The next appropriate action.

Possible primary actions include:
- Review Assignment.
- Acknowledge Assignment.
- Complete Pre-Trip Check.
- Start Route.
- Resume Route.
- View Active Route.

Show one clear primary action at a time, based on the actual assignment state.

Keep secondary actions available without cluttering the card.

## Duplicate assignment investigation

The supplied screenshot displays vehicle `DCD8954` twice, with different order counts and routes.

Investigate whether these represent:
- Two valid assignments using the same vehicle.
- Duplicate assignment records.
- A frontend rendering issue.
- An incorrect backend query.

Use the actual assignment or route ID as the unique identifier.

Never deduplicate genuine assignments solely because they share a vehicle registration.

If they are duplicates, correct the underlying query or data relationship rather than hiding the problem in the frontend.

## Empty and error states

Provide useful states for:
- No assignments.
- No active route.
- All orders completed.
- No historical deliveries.
- Failed API requests.
- Expired authentication.
- Network disconnection.
- Data awaiting synchronisation.

Include appropriate retry actions and useful messages.

---

# 8. ASSIGNMENT MANAGEMENT

Create a detailed assignment screen accessible from every assignment card.

Display:
- Assignment ID.
- Current assignment status.
- Vehicle details.
- Driver and helper details.
- Route information.
- Ordered delivery stops.
- Order count and shipment summary.
- Customer details and delivery addresses.
- Delivery instructions.
- Planned schedule where available.
- Route map or route preview.
- Relevant operational notes.

## Assignment acknowledgement

When an assignment is assigned to the driver, display a clear acknowledgement action.

On acknowledgement:

1. Validate the assignment and driver on the backend.
2. Confirm the assignment is eligible for acknowledgement.
3. Persist the acknowledgement event.
4. Record the authoritative server timestamp.
5. Update the UI after confirmed success.
6. Prevent duplicate submissions.
7. Display a clear confirmation.
8. Handle network failures without falsely showing success.

If a driver cannot accept an assignment, provide a reason-based option to request dispatcher assistance.

Do not silently remove the driver from an assignment or modify dispatch-controlled data.

---

# 9. PRE-TRIP CHECKLIST

Before a route starts, provide a configurable readiness checklist.

Possible checks include:

- Correct vehicle assigned.
- Driver and helper confirmed.
- Vehicle condition checked.
- Tyres and lights checked where required.
- Required documents available.
- Shipment and order count verified.
- Cargo secured.
- Refrigeration equipment checked if applicable to the assigned vehicle.
- Any mandatory company-specific checks completed.

Only implement checks relevant to the actual operation and company policy.

Allow the driver to report a defect, add a description, and attach evidence when supported.

Store checklist results and timestamps in the backend if required by the workflow.

The Start Route action must be blocked when a mandatory check fails or remains incomplete.

Allow an authorised dispatcher or supervisor to handle exceptions according to company policy.

---

# 10. ROUTE EXECUTION AND NAVIGATION

Build a dedicated active-route experience.

Once the driver starts a route, display:

- Active assignment identifier.
- Vehicle registration.
- Route origin and destination.
- Current stop.
- Next stop.
- Remaining stops.
- Completed stops.
- Delivery progress.
- Relevant ETA when available.
- Navigation action.
- Important route warnings.
- Access to order details.
- Access to concern reporting.
- Contact dispatcher action.

Use the existing map provider and route-planning backend. Inspect the current implementation before adding new dependencies.

Provide:
- Route preview.
- Ordered stop list.
- Directions or navigation handoff.
- Stop-level completion.
- Delay reporting.
- Breakdown reporting.
- Route pause/resume when supported.
- Recovery after page refresh.
- Recovery after temporary network failure.

Do not fabricate real-time GPS, traffic information, ETA, or location history.

If the current integration supports external navigation but not in-app turn-by-turn directions, provide a clear Navigate action that opens the appropriate destination in a supported navigation application.

## Starting the route

Starting a route must:

- Validate the assignment state.
- Confirm required readiness checks.
- Persist the route-start event.
- Record the server timestamp.
- Prevent duplicate starts.
- Update the assignment or route status according to the actual business model.
- Activate authorised location tracking only when configured and permitted.

## Route completion

The route must not be marked completed merely because the driver clicks a button.

Validate all required stop outcomes and outstanding issues according to company policy.

Allow unresolved exceptions to follow the appropriate dispatcher review process.

---

# 11. INDIVIDUAL ORDER MANAGEMENT

Each order must have its own detail page and independent status lifecycle.

Display:

- Order ID.
- Current status.
- Customer or business name.
- Delivery address.
- Customer contact details where authorised.
- Delivery instructions.
- Shipment or item description.
- Shipment weight and unit.
- Pack or quantity information.
- Planned delivery window when available.
- Required proof of delivery.
- Previous status events.
- Relevant concerns and exceptions.

Provide clear actions based on the current status.

Examples include:
- View Order.
- Start Delivery.
- Navigate.
- Contact Customer.
- Mark Delivered.
- Report Delivery Issue.

Do not expose every action regardless of state.

Validate all transitions against the actual backend workflow.

---

# 12. ORDER STATUS LIFECYCLE

Implement a clear and auditable status lifecycle.

Use existing status values wherever possible. Do not rename database enums or replace established operational states without an explicit migration plan.

The following is the recommended conceptual lifecycle:

Assignment-level:
Assigned → Acknowledged → Ready to Start → In Transit → Route Completed.

Order-level:
Assigned → In Transit → Out for Delivery → Delivered.

Exception outcomes:
- Partially Delivered.
- Delivery Attempt Failed.
- Customer Unavailable.
- Delivery Refused.
- Address Issue.
- Damaged or Missing Goods.
- Other Exception.

Map these conceptual states to the existing business statuses after auditing the repository.

Some statuses may be combined or represented differently in the existing system. Preserve the established business semantics.

## Required behaviour

When a driver acknowledges an assignment:
- Persist the assignment acknowledgement.
- Record who acknowledged it and when.

When a driver starts a route:
- Persist the route-start event.
- Update the appropriate route or assignment state.
- Do not mark all orders delivered or completed.

When a driver starts a delivery:
- Update the individual order or stop as appropriate.

When a driver completes a delivery:
- Validate the required delivery evidence.
- Persist the order's delivery outcome.
- Record the timestamp and authorised actor.
- Preserve the event history.

When a delivery fails:
- Record the actual reason.
- Save notes and evidence when available.
- Notify the appropriate team according to policy.

When the route is completed:
- Verify that all mandatory stops have acceptable final outcomes.
- Apply the existing business rules for failed deliveries and unresolved exceptions.
- Record the route completion event.

A delivered order must not automatically complete the entire route.

A route starting must not automatically mark every order as In Transit unless that behaviour is explicitly correct for the existing business model.

Implement server-side validation, audit events, and protection against duplicate submissions.

---

# 13. PROOF OF DELIVERY

Build a professional proof-of-delivery workflow.

Support the evidence required by company policy, potentially including:

- Receiver name.
- Receiver signature.
- Delivery photograph.
- OTP or delivery PIN.
- Delivery notes.
- Actual delivered quantity or pack count.
- Partial-delivery details.
- Delivery timestamp.
- Location metadata when authorised and available.

Requirements:

1. Validate required fields before submission.
2. Capture evidence using mobile-friendly controls.
3. Support camera capture and file selection where appropriate.
4. Validate file types and file sizes.
5. Upload evidence securely.
6. Show upload progress.
7. Support safe retries.
8. Persist evidence references in the backend.
9. Confirm delivery only after the backend accepts the required evidence and status transition.
10. Preserve unsynchronised evidence during temporary connectivity failures.

Do not require photographs, signatures, or OTPs for every order unless the business policy requires them.

Do not expose sensitive delivery photographs through unauthorised public URLs.

Do not display a successful delivery confirmation when the backend has rejected the operation or the status is still pending synchronisation.

---

# 14. DELIVERY EXCEPTIONS AND CONCERNS

Provide a dedicated Report an Issue action on:
- Active routes.
- Individual order pages.
- Assignment details.
- The Help and Support section.

The concern form should include:

- Concern reference ID.
- Authenticated driver ID.
- Assignment ID.
- Order ID where relevant.
- Concern category.
- Priority.
- Description.
- Photo or file evidence.
- Creation timestamp.
- Current concern status.
- Resolution notes where available.

Prefill relevant information from the current assignment or order.

Suggested concern categories:
- Delivery delay.
- Customer unavailable.
- Incorrect address.
- Damaged goods.
- Missing goods.
- Partial delivery.
- Vehicle breakdown.
- Traffic or route issue.
- Incorrect assignment.
- Vehicle mismatch.
- Helper unavailable.
- Refrigeration or cargo-handling issue where applicable.
- Application or technical issue.
- Other.

Suggested priorities:
- Normal.
- High.
- Urgent.

Suggested concern statuses:
Submitted → Acknowledged → In Progress → Resolved or Closed.

Map these to existing concern statuses if a concern-management system already exists.

## Submission requirements

When the driver submits a concern:

1. Validate the form.
2. Authenticate the driver.
3. Verify access to the referenced assignment or order.
4. Persist the concern in the backend.
5. Generate or return a unique concern reference.
6. Save evidence securely.
7. Trigger the configured operations notification.
8. Show a confirmation only after successful persistence.
9. Display the concern in the driver's concern history.
10. Provide status updates when the operations team responds.

Urgent concerns should trigger the configured escalation workflow.

An in-app notification alone must not be treated as a guaranteed urgent alert if the application is closed.

---

# 15. ZOHO FORMS INTEGRATION

Inspect the repository and current Zoho configuration before implementing this feature.

If a relevant Zoho Forms concern form already exists, reuse it instead of creating a duplicate.

The form should collect the relevant driver and delivery context.

Prefill fields where supported:
- Driver ID.
- Driver name.
- Assignment ID.
- Order ID.
- Vehicle registration.
- Current order status.
- Concern category, when applicable.

Use the official Zoho Forms embed or approved API integration according to the existing setup.

Requirements:
- Responsive form display.
- Clear loading and error states.
- Required-field validation.
- Mobile-friendly inputs.
- Correct prefilled values.
- Secure handling of uploaded evidence.
- Reliable submission confirmation.
- Clear error recovery.

Do not expose Zoho API secrets or privileged credentials in frontend code.

If a native application form provides a better user experience, use a backend-mediated Zoho integration where supported.

Avoid creating duplicate concern records when both the native form and Zoho are involved.

Document which system is the authoritative source for concern records and how submissions are synchronised.

Verify that a successful submission actually reaches the intended Zoho form or API and triggers the intended operations workflow.

Do not claim integration is complete merely because an iframe is displayed.

---

# 16. DISPATCHER AND OPERATIONS COMMUNICATION

Provide a dedicated support and communication experience.

Include:
- Call Dispatcher.
- Contact Supervisor.
- Report Urgent Issue.
- View My Concerns.
- View Operations Responses.
- Relevant company contact details.
- Appropriate support hours or escalation instructions when configured.

Allow drivers to communicate an issue in the context of a specific order or route.

Use existing communication channels where available.

Where direct messaging does not exist, implement a structured concern workflow rather than pretending a chat system exists.

The dispatcher should receive the information needed to act:
- Concern reference.
- Driver identifier.
- Assignment and order references.
- Issue category and priority.
- Description.
- Relevant delivery status.
- Evidence links or secure references.
- Creation time.

Do not send unnecessary personal information.

Persist communication history when supported by the existing system.

---

# 17. NOTIFICATION CENTRE AND ALERTS

Create an Alerts page with a clear unread count.

Potential events include:
- New assignment received.
- Assignment updated.
- Assignment cancelled.
- Route ready to start.
- Delivery deadline or schedule change.
- Delivery exception.
- Urgent concern.
- Dispatcher response.
- Proof-of-delivery upload failure.
- Synchronisation failure requiring action.

Each notification should contain:
- Title.
- Short description.
- Timestamp.
- Read/unread status.
- Priority when applicable.
- Link to the related assignment, order or concern.

Requirements:
- Mark as read.
- Preserve notification history.
- Prevent duplicate notifications for the same event.
- Provide empty, loading and error states.
- Support deep links into the relevant screen.

Reuse the existing notification infrastructure where possible.

If push notifications are not configured, implement a documented fallback or the appropriate backend integration.

Do not claim push delivery works until the provider and device permissions are configured and verified.

Urgent operational escalation must follow an explicit, tested notification policy.

---

# 18. HISTORY AND COMPLETED DELIVERIES

Create a professional History page.

Include:
- Previous assignments.
- Completed routes.
- Delivered orders.
- Failed delivery attempts.
- Partial deliveries.
- Cancelled or reassigned assignments where authorised.
- Delivery timestamps.
- Proof-of-delivery references.
- Related concerns and exceptions.

Provide filters for:
- Date range.
- Order ID.
- Assignment ID.
- Route.
- Delivery status.

Use server-side filtering and pagination for large datasets.

Historical delivery records should be read-only for ordinary drivers unless the existing business workflow permits a specific follow-up action.

Provide useful empty states and ensure older records remain accessible according to retention policy.

---

# 19. MOBILE-FIRST UI AND INTERACTION DESIGN

The mobile experience is the primary design target.

Maintain the existing colour palette while improving layout and usability.

## Mobile layout

Test at:
- 360px.
- 390px.
- 430px.

Ensure:
- No horizontal overflow.
- No clipped text.
- No overlapping buttons.
- No content hidden behind the bottom navigation.
- No fixed elements covering important content.
- Appropriate mobile keyboard behaviour.
- Comfortable scrolling.
- Clear status labels.
- Easy-to-tap actions.
- Responsive tables or lists.
- Appropriate safe-area spacing.

Use touch targets of approximately 48 CSS pixels for important actions where practical.

## Desktop layout

Preserve the existing working desktop layout and improve it without unnecessary structural changes.

Use the available space effectively while retaining consistent information hierarchy.

## Reusable components

Create or reuse components for:
- Driver header.
- Assignment card.
- Order card.
- Status badge.
- Primary and secondary buttons.
- Form fields.
- Confirmation dialogs.
- Error messages.
- Notification item.
- Delivery timeline.
- Stop list.
- Proof-of-delivery upload.
- Loading skeleton.
- Empty state.
- Offline and synchronisation indicator.

Do not introduce inconsistent component styles across different pages.

## Interaction design

Every interactive element must have a real, appropriate action.

Avoid:
- Decorative buttons that do nothing.
- Fake status transitions.
- Fake maps.
- Fake delivery progress.
- Placeholder success messages.
- Dead navigation links.
- Unimplemented notification actions.

If a capability requires external configuration, show a clear unavailable or configuration-required state rather than pretending it works.

---

# 20. OFFLINE SUPPORT AND DATA SYNCHRONISATION

Drivers may operate in areas with unreliable connectivity.

Inspect the existing architecture and implement practical offline resilience.

Where feasible:
- Cache authorised assignment and order information.
- Display connectivity status.
- Show the last successful synchronisation time.
- Preserve active-route progress.
- Queue eligible pending operations.
- Queue delivery evidence securely.
- Retry failed requests.
- Assign unique operation identifiers.
- Prevent duplicate status changes and concern submissions.
- Display Pending Sync, Synced and Sync Failed states.

Do not treat a client-side update as server-confirmed merely because it has been added to a local queue.

The application must distinguish between:
- Saved locally.
- Awaiting synchronisation.
- Confirmed by the server.
- Failed and requiring attention.

Use server-side validation to resolve conflicting updates.

Do not persist sensitive credentials or evidence insecurely.

If full offline operation is outside the existing architecture, implement a safe incremental solution and document the limitations.

---

# 21. BACKEND, DATABASE, AND SECURITY

Reuse the existing backend, database and API conventions.

Implement or verify the operations needed for:
- Driver profile retrieval.
- Assignment retrieval.
- Assignment acknowledgement.
- Pre-trip checklist submission.
- Route start, pause/resume and completion.
- Order details.
- Order status transitions.
- Proof-of-delivery uploads.
- Concern creation and history.
- Notification retrieval and read state.
- Delivery history.
- Driver support interactions where supported.

Do not invent endpoint names or payload fields without inspecting the existing implementation.

Implement missing operations using the established project conventions.

## Security requirements

- Authenticate every protected operation.
- Enforce driver ownership and assignment permissions on the server.
- Validate order and assignment references.
- Validate status transitions.
- Protect delivery evidence.
- Keep privileged API credentials server-side.
- Validate uploaded file types and sizes.
- Prevent unauthorised modification of dispatch-controlled data.
- Use server timestamps as authoritative event timestamps.
- Record important status changes in an audit trail.
- Prevent duplicate processing of retried requests.
- Handle concurrent updates safely.
- Avoid exposing secrets or sensitive customer information in logs.
- Follow existing retention and access policies.

Preserve existing production data.

Do not make destructive database changes without an explicit migration plan, appropriate safeguards, and a rollback strategy.

---

# 22. PERFORMANCE AND RELIABILITY

Optimise the application for real mobile devices and unreliable networks.

Requirements:
- Avoid unnecessary API calls.
- Avoid repeated requests on every render.
- Use pagination for large histories.
- Load detailed evidence only when needed.
- Optimise image uploads and previews.
- Provide useful retry behaviour.
- Handle API timeouts and expired sessions.
- Prevent duplicate form submissions.
- Keep navigation responsive.
- Preserve state during ordinary screen transitions.
- Avoid unnecessary new dependencies.

Use the existing package manager and supported library versions.

Do not rewrite the project into a new framework solely to achieve the redesign.

---

# 23. TESTING REQUIREMENTS

Test the full driver journey using the actual development backend or a controlled test environment.

## Authentication tests
- Valid login.
- Invalid login.
- Expired session.
- Logout.
- Protected-route access.
- Driver data isolation.

## Assignment tests
- Assignment list loads correctly.
- Genuine assignments sharing a vehicle remain distinct.
- Duplicate records are investigated.
- Acknowledgement persists after refresh.
- Invalid acknowledgement is rejected.
- Failed requests show useful errors.

## Route tests
- Pre-trip checklist validation.
- Start route.
- Duplicate start prevention.
- Active-route recovery after refresh.
- Route pause/resume where supported.
- Route completion validation.

## Order tests
- Individual order details.
- Valid status transitions.
- Partial delivery.
- Failed delivery.
- Customer unavailable.
- Proof-of-delivery validation.
- Upload failure and retry.
- Preventing false delivery confirmation.
- Independent progress across multiple orders.

## Concerns and Zoho tests
- Required fields.
- Invalid submissions.
- Successful concern persistence.
- Evidence upload.
- Correct assignment and order references.
- Zoho submission where configured.
- Operations notification.
- Duplicate submission prevention.
- Concern status updates.
- Notification failure handling.

## UI tests
- Mobile layouts at 360px, 390px and 430px.
- Tablet layout.
- Desktop layout.
- Bottom navigation.
- All primary actions.
- Form validation.
- Loading states.
- Empty states.
- Error states.
- Offline states.
- Accessibility and keyboard interaction.

## Build verification

Run the existing project commands for:
- Linting.
- Type checking.
- Unit tests.
- Integration tests where available.
- Production frontend build.
- Backend compilation and relevant tests.

Fix errors introduced by the changes. Do not claim that a test passed unless it was actually executed successfully.

---

# 24. IMPLEMENTATION PHASES

Implement the upgrade incrementally.

### Phase 1 — Audit and baseline
Inspect the existing repository, map the current workflow, identify actual API contracts, investigate duplicate assignments, and document the implementation plan.

### Phase 2 — UI foundation
Improve the shared layout, responsive behaviour, existing colour-theme consistency, Home dashboard, assignment cards, login and profile.

### Phase 3 — Assignments and routes
Implement acknowledgement, pre-trip readiness, route execution, navigation, stop lists and route recovery.

### Phase 4 — Order lifecycle and POD
Implement order details, status transitions, delivery evidence, partial deliveries, failed deliveries and route-completion validation.

### Phase 5 — Concerns, Zoho and notifications
Implement the concerns workflow, Zoho integration, operations escalation, notification centre and concern history.

### Phase 6 — History and reliability
Complete history, offline resilience, synchronisation, error handling, security checks and audit events.

### Phase 7 — QA and deployment
Run the available tests and production build, verify configuration, test the complete driver journey, and document the deployment steps.

Do not attempt a risky, unverified rewrite of every component at once. Keep the existing application operational throughout the implementation.

---

# 25. REQUIRED FINAL DELIVERABLES

When implementation is complete, provide:

1. Summary of the existing application audit.
2. List of implemented screens and features.
3. List of modified and added files.
4. Backend endpoints reused and added.
5. Database migrations and schema changes.
6. Final assignment, route and order lifecycle.
7. Proof-of-delivery implementation details.
8. Zoho Forms configuration and verification status.
9. Notification and escalation behaviour.
10. Authentication and security checks.
11. Mobile and desktop testing results.
12. Lint, typecheck, test and production-build results.
13. Required environment variables and external configuration.
14. Deployment instructions.
15. Any outstanding limitations or configuration dependencies.

Clearly distinguish fully implemented functionality from features that still require credentials, external configuration or additional backend work.

---

# FINAL ACCEPTANCE CRITERIA

The upgrade is complete only when:

- The existing colour theme remains unchanged.
- The app looks professional and mobile-first.
- Existing authentication and assignments continue to work.
- The duplicate vehicle-card issue is investigated and correctly handled.
- Drivers can acknowledge their assignments.
- Drivers can start routes after required checks.
- Individual orders have independent status transitions.
- Delivery evidence is securely recorded where required.
- Failed and partial deliveries are handled correctly.
- Drivers can report concerns and access their history.
- Zoho Forms is genuinely integrated where configured.
- The operations team receives the appropriate configured notifications.
- Drivers can review notifications and historical deliveries.
- Backend operations enforce authorisation and valid state transitions.
- Offline or failed operations are not falsely represented as successful.
- The application works on mobile, tablet and desktop.
- The existing production build and integrations remain intact.

**Final design principle: preserve the colours, improve the experience, and make every operational action genuinely work.**