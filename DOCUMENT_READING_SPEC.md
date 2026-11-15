# Continuous course reading

## Behavior

Ordinary authorized learners default to a continuous document containing all lessons and pages in the selected published business version. A two-level table of contents (lesson, page) jumps without browser reload; scrolling updates the active section and its stable lesson/page URL. Desktop uses a persistent sidebar; mobile provides a collapsible directory and chapter selector. Markdown, tables, images, diagrams, learning objectives and self-assessment remain available.

Learners can explicitly switch to the existing page view. Preference is scoped to the current user and course on this browser. Instructors retain the existing teaching workspace by default, and can choose full-course reading. Switching language, refreshing material and following a source or discussion link use the same page identifiers. Reading telemetry, notes, discussions, related links and annotations refer to the active section, not to every section merely rendered in the document.

## Access boundary

This is a presentation of the existing authorized `/api/course` response, not a public export endpoint. No course content is placed in static assets. Course identity, publication, audience and expiry checks remain server-side. A legacy course entry preference for PPT does not override ordinary learners' new default; explicit PPT URLs still open PPT. Existing PPT links retain first-page preview, approval, per-reader expiry and revocation. A PPT visitor cannot obtain classroom material using the same grant. This does not promise prevention of screenshots or copying by an authorized viewer.

No database or course-content migration. No model calls are added by document reading. Releases use the hosting project's existing site-specific runtime and model/tunnel guards.

## Verification

`tests/share-entry-browser.cjs` uses isolated synthetic data and verifies the learner default, instructor default, all 28 sections across three lessons, directory jumps without reload, browser history, reading-mode persistence, current-section tracking, self-assessment, private note entry, mobile/desktop layout, refresh deep links, and return to PPT. It also verifies the existing PPT preview/approval/expiry/instructor-invitation behavior and denial of classroom access for a PPT-only visitor. Existing server tests cover course authorization, publication, isolation and revocation. Production verification checks release assets and service health without modifying customer courses or impersonating a user.
