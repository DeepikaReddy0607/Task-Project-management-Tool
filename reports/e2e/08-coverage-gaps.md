# 08 — Coverage Gaps & Limitations

## 1. Verified Coverage Scope
All 17 core functional modules of TaskFlow have been directly exercised via real browser journeys (Playwright with Chrome) and integration test suites:
- Authentication, Profile, Workspaces, Projects, Tasks, Kanban, Realtime Sockets, Collaboration, Calendar, Reports, Dependencies, Risks, Decisions, Command Center, Simulations, Search & Filters, Admin, RBAC.

---

## 2. Identified Coverage Gaps & Environment Constraints

1. **Email Delivery Verification:**
   - Password reset initiation was tested via API (`/api/auth/forgot-password`). Actual SMTP outbound inbox delivery could not be confirmed in this local offline sandbox because external SMTP network connectivity is restricted.
2. **Third-Party OAuth / SSO:**
   - The application relies on native email/password + JWT. No third-party OAuth providers (Google, GitHub) are configured or tested.
3. **Cross-Browser Matrix:**
   - Chrome on Windows was verified. Headless Firefox and WebKit were not run because Playwright bundled browser downloads are restricted in this offline sandbox.
4. **Mobile Native Devices:**
   - Tested responsive desktop and tablet viewports (1280x800). Real mobile touch-gesture interactions on physical iOS/Android hardware were not included.
