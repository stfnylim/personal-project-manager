---
name: log
description: Create or update the project log (project.md / log.md folders under <projects-dir>) after finishing significant work, hitting a milestone, or when a project becomes blocked or done. Also use when the user says "log this", "update the project log", "add this to the PM", or similar.
---

<!-- Install: copy to ~/.claude/skills/log/SKILL.md (or %USERPROFILE%\.claude\skills\log\SKILL.md)
     and replace every <projects-dir> with the absolute path of this instance's projects folder. -->

# Update the project log

1. Read `<projects-dir>\PROTOCOL.md` and follow it exactly — it defines the schema the sync
   script parses.
2. List the project folders in `<projects-dir>\` and decide whether the current work belongs to
   an existing project. Only create a new folder (copy `_templates\project.md`,
   lowercase-kebab-case folder name) if none fits.
3. Update that project's `project.md`: status if it changed, summary if the goal shifted, and the
   `## Tasks` checkboxes (add new milestone-sized tasks, check off finished ones). Never write
   manual progress counters — progress is derived from the checkboxes.
4. Append ONE entry to the bottom of `log.md`: heading `## YYYY-MM-DD HH:MM` using a real shell
   timestamp (`Get-Date -Format "yyyy-MM-dd HH:mm"` / `date +"%Y-%m-%d %H:%M"`), then 2–3
   plain-language sentences written for a reader who was not in this chat: what happened, what
   changed, what's next or blocking.
5. If git reports changes in the projects folder, commit them there:
   `git -C <projects-dir> add -A` then commit with a one-line message.
6. Tell the user what was logged: the project ID and a one-line restatement of the entry.

Never put secrets, credentials, or confidential details in these files.
