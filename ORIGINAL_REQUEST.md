# Original User Request

## 2026-09-05T06:45:01Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full team

Complete the frontend of this project to a production-ready standard, performing a comprehensive audit and implementation pass while preserving existing backend contracts.

Working directory: e:\SIH-171
Integrity mode: development

## Requirements

### R1. Complete Frontend Audit
Inspect the complete codebase and identify every page, route, component, missing interaction, placeholder, broken flow, responsive issue, and visual inconsistency. Create an internal checklist of gaps.

### R2. Implement All Missing UI
Turn every placeholder, "coming soon" section, empty card, and mock component into functional UI. Connect all functional elements to the existing backend/API. Do not invent new backend architecture.

### R3. Fix UI/UX Flaws and Interactions
Standardize spacing, typography, and components. Implement full interaction lifecycles for every element (Hover, Focus, Active, Loading, Error, Disabled). Ensure the application is fully responsive and accessible.

### R4. Preserve Working Functionality
Do not unnecessarily break or rewrite working functionality. Preserve existing API contracts and business logic.

### R5. Autonomous QA Pass
Perform a final autonomous QA pass of the entire frontend as if reviewing a senior engineer's PR. Fix every discovered issue directly in the codebase (unfinished UI, broken interactions, responsive problems, etc.) without stopping at merely reporting them.

## Acceptance Criteria

### Route-by-Route Verification
- [ ] Every route renders correctly and uses real data from the backend.
- [ ] Every visible action works and is connected to the backend if applicable.
- [ ] Loading, empty, and error states are handled for all data-heavy screens and forms.
- [ ] Layout works correctly on mobile, tablet, and desktop viewports.
- [ ] No major dead buttons, fake data, or dead navigation items remain.
- [ ] No obvious prototype artifacts or placeholders remain.
- [ ] Console/runtime errors caused by the frontend are resolved.

## Follow-up — 2026-09-05T07:26:50Z

Ensure that all Indian PII patterns strictly follow the updated rules from the requirements, and E2E coverage is comprehensive. Keep going.

## Follow-up — 2026-09-05T08:27:19Z

[SYSTEM NOTE: The previous run of this agent crashed during Milestone 2 due to API quota limits (RESOURCE_EXHAUSTED). The quota issue has been resolved by switching models. The workspace already contains `ORIGINAL_REQUEST.md`, `TEST_INFRA.md`, and an `.agents` directory with progress states. Milestone 1 is largely completed (E2E tests Tiers 1-2, Indian PII added, package.json updated). Please read `.agents/orchestrator_gen2/PROJECT.md` and resume the execution from Milestone 2 (Responsive Shell & A11y), continuing all the way through the rest of the milestones.]

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → delegate to teamwork_preview
> Requested team: Full team

Complete the frontend of this project to a production-ready standard, performing a comprehensive audit and implementation pass while preserving existing backend contracts.

Working directory: e:\SIH-171
Integrity mode: development

## Requirements

### R1. Complete Frontend Audit
Inspect the complete codebase and identify every page, route, component, missing interaction, placeholder, broken flow, responsive issue, and visual inconsistency. Create an internal checklist of gaps.

### R2. Implement All Missing UI
Turn every placeholder, "coming soon" section, empty card, and mock component into functional UI. Connect all functional elements to the existing backend/API. Do not invent new backend architecture.

### R3. Fix UI/UX Flaws and Interactions
Standardize spacing, typography, and components. Implement full interaction lifecycles for every element (Hover, Focus, Active, Loading, Error, Disabled). Ensure the application is fully responsive and accessible.

### R4. Preserve Working Functionality
Do not unnecessarily break or rewrite working functionality. Preserve existing API contracts and business logic.

### R5. Autonomous QA Pass
Perform a final autonomous QA pass of the entire frontend as if reviewing a senior engineer's PR. Fix every discovered issue directly in the codebase (unfinished UI, broken interactions, responsive problems, etc.) without stopping at merely reporting them.

## Acceptance Criteria

### Route-by-Route Verification
- [ ] Every route renders correctly and uses real data from the backend.
- [ ] Every visible action works and is connected to the backend if applicable.
- [ ] Loading, empty, and error states are handled for all data-heavy screens and forms.
- [ ] Layout works correctly on mobile, tablet, and desktop viewports.
- [ ] No major dead buttons, fake data, or dead navigation items remain.
- [ ] No obvious prototype artifacts or placeholders remain.
- [ ] Console/runtime errors caused by the frontend are resolved.

## Follow-up — 2026-09-05T08:29:37Z

Acknowledged. Please continue with Milestone 2 and ensure the responsive shell updates don't break the Chrome popup bounds.

