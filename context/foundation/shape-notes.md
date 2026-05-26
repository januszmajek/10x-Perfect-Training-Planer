---
project: "CraftMatch"
context_type: greenfield
created: 2026-05-23
updated: 2026-05-23
checkpoint:
  current_phase: 4.5
  phases_completed: [1, 2, 3]
  gray_areas_resolved:
    - topic: "Primary persona scope"
      decision: "Individual specialist actively applying for jobs."
    - topic: "Pain category"
      decision: "Workflow friction: CV tailoring takes too long; data trapped in memory: work examples are hard to remember later."
    - topic: "Product insight"
      decision: "CV quality depends on continuous experience capture, not last-minute writing."
    - topic: "Access control"
      decision: "Login with email and password only; flat user model where each user maintains only their own data."
    - topic: "MVP flow"
      decision: "AI-only resume generation from saved crafts plus a pasted job offer; manual resume creation is out of scope."
    - topic: "Timeline budget"
      decision: "3-week after-hours MVP accepted as challenging but possible."
    - topic: "Job offer retention"
      decision: "Pasted job offers are used for generation but are not saved in the application."
    - topic: "Craft threshold"
      decision: "Resume generation unlocks after 3 crafts; crafts do not have to be unique areas."
  frs_drafted: 9
  quality_check_status: pending
---

# Shape Notes

Seed source: `idea-notes.md`

## Vision & Problem Statement

Individual specialists actively applying for jobs spend too much time tailoring a CV to a concrete job offer because their relevant experience, skills, achievements, solved problems, and newly gained competencies are not continuously captured in one place.

The product insight is that CV quality depends on continuous experience capture, not last-minute writing. When work examples remain trapped in memory, applicants struggle to recall concrete evidence and lose sight of their professional growth exactly when they need to present it clearly.

## User & Persona

Primary persona: an individual specialist actively applying for jobs.

They reach for CraftMatch when they need to prepare or tailor a CV for a specific job offer and want to turn their recorded experience history into a stronger, more relevant application.

## Access Control

Users log in with email and password only.

The MVP uses a flat user model: each authenticated user can maintain only their own experience and CV data. No admin, member, guest, or shared-workspace roles are in scope for MVP.

## Success Criteria

### Primary

- A logged-in user can add at least 3 craft areas, paste a specific job posting, generate an AI-created resume from the saved crafts and pasted job posting, download the resume as HTML, and have the generated CV stored in the application database.

### Secondary

- The user adds or updates at least one craft weekly.

### Guardrails

- Pasted job postings and craft data stay private.
- Pasted job postings are not saved in the application.
- Generated CVs can always be downloaded as HTML.

## Timeline Budget

- MVP target: 3 weeks of after-hours work.
- User assessment: challenging but possible.

## User Stories

### US-01: Generate a tailored CV from saved crafts

- **Given** a logged-in user with at least 3 crafts saved in CraftMatch
- **When** the user pastes a specific job posting and requests CV generation
- **Then** the app generates an AI-created CV from the saved crafts and pasted job posting, lets the user download it as HTML, and stores the generated CV in the application database

#### Acceptance Criteria

- A user with fewer than 3 saved crafts cannot generate a CV yet.
- The 3 crafts do not have to be unique areas; for example, Angular, TypeScript, and React count as 3 crafts.
- The pasted job posting is used for generation but is not saved in the application.
- The generated CV is downloadable as HTML.

## Functional Requirements

### Authentication

- FR-001: User can log in with email and password. Priority: must-have

### Craft Capture

- FR-002: User can add a craft. Priority: must-have
- FR-003: User can view, edit, and delete their crafts. Priority: must-have
- FR-004: User can generate a CV only after at least 3 crafts are saved. Priority: must-have

### CV Generation

- FR-005: User can paste a specific job posting for CV generation. Priority: must-have
- FR-006: User can generate an AI-created CV from saved crafts plus the pasted job posting. Priority: must-have
- FR-007: User can download the generated CV as HTML. Priority: must-have
- FR-008: User can access previously generated CVs stored in the app. Priority: must-have

### Privacy

- FR-009: Application does not save pasted job postings. Priority: must-have
