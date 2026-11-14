# Admin course overview

The Courses & materials view shows all courses as searchable cards instead of an opaque course dropdown. Each card identifies the bilingual name, enabled state, material availability and selected course. Selection uses the existing course editor and resets the business-version context. Search matches either language and the course identifier. Disabled and empty courses remain manageable. Cards wrap on small screens and support keyboard selection.

## Administrator course-code display (2026-11-14)

The administrator-only course list displays each course's current selection code. New creation and code rotation atomically save an AES-256-GCM encrypted display copy in a separate course-keyed table; the existing private runtime codeKey derives its encryption key, with the course ID as authenticated context. Existing authentication hashes and access rules remain authoritative. Only /api/admin/courses returns the display code, never public/session/instructor/switch-course responses, exports or audit logs. Rendering escapes all code text and wraps long values. The existing change-code action refreshes the list immediately after success.

Legacy hashes cannot be reversed: show “Historical code not saved; change it to display”. Do not reset existing codes. A known legacy code may be stored only after matching its existing hash and lookup; a successful code-based selection can similarly recover its display copy. Missing/corrupt ciphertext yields the unavailable label without exposing internals or breaking the list. No browser storage retains codes. Database and existing private runtime settings must be backed up together.

Acceptance: creation/rotation/restart round trip, mismatched legacy code rejected, no cross-course ciphertext reuse, legacy course still accessible, administrator-only API, HTML escaping, immediate refresh and desktop/mobile wrapping. Existing publication and learner authorization behavior remains unchanged.

The Switch course dialog lists enabled courses previously visited by the verified identity, explicitly inherited access, and current instructor/admin assignments. History is not authorization: every ID-based switch rechecks eligibility and returns the approval flow when needed. Unknown IDs are rejected; course codes remain available for discovering new courses. No codes, private content or other users’ history are returned. A newly selected unpublished course cannot replace the active course.
