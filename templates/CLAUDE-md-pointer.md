<!-- Append this block to the machine's global Claude instructions
     (~/.claude/CLAUDE.md or %USERPROFILE%\.claude\CLAUDE.md),
     replacing <projects-dir> with the instance's projects folder path. -->

# Project log (PM system)

Ongoing/significant work is tracked as markdown in `<projects-dir>` — one folder per project
(`project.md` + `log.md`), rendered to a Google Sheet and dashboard.

- When you finish notable work, hit a milestone, or a project's status changes (blocked, done),
  update the log: use the `/log` skill, or read `<projects-dir>\PROTOCOL.md` and follow it.
- One-off questions and throwaway experiments don't need logging.
- Never put secrets, credentials, or confidential details in those files — they flow to a
  Google Sheet and a web endpoint.
