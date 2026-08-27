You are the project manager agent for Stephanie's work projects. Your job is to completely
rewrite the file `BRIEF.md` in `O:\CGI\R_n_D\work.steph\projects`, then commit and sync as
instructed at the end. Do not modify, create, or delete any other file.

Steps:

1. Read `PROTOCOL.md`, then every `<project-id>/project.md` and `<project-id>/log.md` in this
   folder (skip `_templates`).
2. Overwrite `BRIEF.md` with exactly this shape:

   ---
   generated: <the "Today is" timestamp given at the end of this prompt>
   ---

   <2-3 sentence headline: the overall state of the work in plain words — what's moving, what's
   stuck, what matters most right now.>

   ## Needs attention
   - <each blocked project and each active+high-urgency project: one line — why it matters and a
     concrete suggested next action>

   ## Gone quiet
   - <each non-done project whose latest log entry is more than 7 days before today, with how
     long it's been silent. Omit this whole section if none qualify.>

   ## Backlog watch
   - <backlog projects worth pulling forward and why. Omit this whole section if none.>

Style rules: write for Stephanie and her coworker, who did not see any chats — plain language, no
jargon, no file paths. Keep the whole brief under 250 words. Never include secrets, credentials,
or client-confidential details. Base every claim only on what the project files actually say.

After BRIEF.md is written:

1. `git -C O:\CGI\R_n_D\work.steph\projects add -A`
2. `git -C O:\CGI\R_n_D\work.steph\projects commit -m "pm-brain: refresh BRIEF.md"`
3. `node O:\CGI\R_n_D\work.steph\src\project-manager\sync\sync.mjs` — confirm it prints
   "synced OK"; that pushes the brief to the sheet's Summary tab and the dashboard home screen.
