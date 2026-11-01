# QuietIQ public demo: privacy and responsible testing

QuietIQ is a student-built classroom AI demonstration, not a disciplinary or attendance system.

## What is public

The website HTML, CSS, SVG branding, JavaScript code, pinned model packages, and website traffic endpoints are publicly accessible on GitHub Pages. A visitor's browser independently asks for permission to use *their own* camera and microphone.

## What is never uploaded by this version

The site includes no application backend endpoints and does not include `fetch('/api/recordings')`, `fetch('/api/events')`, or any remote audio-upload code. Camera frames are processed in-browser. Optional photos live in session memory until downloaded, and aggregate event history lives in browser localStorage. With separate informed consent and a manual recording click, microphone clips live in browser IndexedDB on the same device/profile.

**Caution:** A visitor can choose to download clips to their disk. The host will still see standard web requests, including IP addresses and static asset requests. Web browser extensions and operating-system telemetry are outside QuietIQ's control.

## Consent and restrictions

- Tell everyone in camera/microphone range what is being recorded, what is estimated, and where data is stored. Obtain required school and guardian approvals.
- Do not leave QuietIQ recording when the monitoring tab is hidden or when permission has been withdrawn.
- Do not use red possible-speaker highlights to accuse or rank students. Motion can be misinterpreted and one microphone cannot identify a particular person.
- This public version provides **no teacher accounts or access control**. Browser storage belongs to whoever controls that browser profile.
- For a secure teacher archive, use a school-approved restricted computer and information governance process; do not assume a publicly shared website offers this.

## Release test checklist

- [ ] GitHub Actions website deployment succeeds and the published URL is HTTPS.
- [ ] `LAUNCH QUIETIQ` scrolls to the working device selector.
- [ ] AI files show ready in Status section.
- [ ] USB webcam and microphone are independently selectable.
- [ ] The live microphone level changes when speaking.
- [ ] `Silero audio frames processed` increases; if not, use compatibility mode and troubleshoot before sharing as a functional AI demo.
- [ ] MediaPipe shows green face boxes; optional red box is approximate.
- [ ] Teacher Absence Mode only activates with correct consent.
- [ ] Optional audio recording starts only after separate consent + Start click, and the red banner is visible.
- [ ] Audio clips play/download/delete in the *same browser profile* and never appear on a different device.
- [ ] Export CSV, PDF report, dark/light mode, and mirrored camera work.
- [ ] Explain that 29–40 simultaneous face detection is not guaranteed on ordinary webcams.
