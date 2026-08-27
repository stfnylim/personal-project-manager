import type { Project, Update } from './api';

/** Canonical chat prompts behind the dashboard's copy buttons. Each source
 *  (instance) has its own projects folder; pass its `projectsDir` when known so
 *  the prompt names the exact path. Without one, the prompt points the assistant
 *  at its machine-level pointer instead. */

function dirLine(dir?: string): string {
  return dir
    ? `Read ${dir}\\PROTOCOL.md and follow it exactly.`
    : `Find my project manager's projects folder (your global instructions have a "Project log (PM system)" pointer to it), read its PROTOCOL.md, and follow it exactly.`;
}

const TAIL = `For the rest of this chat, keep the project updated without being asked: check off tasks as they finish, add tasks if scope grows, append a timestamped log entry at each milestone or when the session wraps up, and commit the projects folder (git add -A plus a one-line message).

Never put secrets, credentials, or client-confidential details in those files.`;

export function newProjectPrompt(dir?: string): string {
  return `Project tracking: this chat is starting a new project that must be tracked in my project manager.

1. ${dirLine(dir)}
2. Create a new project folder there: lowercase kebab-case folder name (that is the permanent project id), a project.md based on _templates\\project.md with name, status, horizon, urgency, summary and a milestone-sized task checklist filled in, and a log.md with a first timestamped entry (get the timestamp from the shell, never guess it).
3. Tell me the project id you chose and the summary you wrote.

${TAIL}`;
}

/** Kickoff prompt for one specific task of one project (the ⚡ buttons). */
export function taskPrompt(projectId: string, taskText: string, dir?: string): string {
  return `Project tracking: continue work on the project "${projectId}" in my project manager.

1. ${dirLine(dir)} Then read that project's project.md and log.md for context.
2. The task to work on right now: ${taskText}
3. Tell me your plan for this task before making changes.

${TAIL}`;
}

/** Everything the dashboard knows about a task's project, for a self-contained
 *  kickoff prompt (the "start" buttons). */
export interface TaskContext {
  project: Project;
  /** this project's log entries, any order */
  updates: Update[];
  /** other still-open task texts in the same project */
  openSiblings: string[];
  dir?: string;
}

/** Task kickoff with tracker context baked in: goal, status, recent log, and
 *  what else is open — so the receiving chat starts oriented, then still reads
 *  the files as the source of truth. */
export function taskStartPrompt(ctx: TaskContext, taskText: string): string {
  const p = ctx.project;
  const recent = [...ctx.updates]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 3)
    .map((u) => `  - ${u.timestamp}: ${u.entry.split('\n')[0]}`);
  const lines = [
    `Project tracking: continue work on the project "${p.id}" (${p.name}) in my project manager.`,
    '',
    'What the tracker knows right now:',
    `- Goal: ${p.summary}`,
    `- Status: ${p.status}, urgency ${p.urgency}, tasks done ${p.progress || '—'}`,
  ];
  if (recent.length) lines.push('- Recent log (newest first):', ...recent);
  if (ctx.openSiblings.length)
    lines.push(`- Other open tasks (NOT this session's focus): ${ctx.openSiblings.join('; ')}`);
  lines.push(
    '',
    `1. ${dirLine(ctx.dir)} Then read this project's project.md and log.md — the files are the source of truth if they disagree with the summary above.`,
    `2. The task to work on right now: ${taskText}`,
    '3. Tell me your plan for this task before making changes.',
    '',
    TAIL,
  );
  return lines.join('\n');
}

export function addProjectPrompt(dir?: string, projectId?: string): string {
  const step2 = projectId
    ? `2. This chat's work belongs to the project "${projectId}". Read its project.md and log.md for context before doing anything else.`
    : `2. List the project folders there and decide which one this chat's work belongs to. Read that project's project.md and log.md for context before doing anything else. If nothing fits, ask me whether to create a new folder instead.`;
  return `Project tracking: the work in this chat belongs to an existing project in my project manager.

1. ${dirLine(dir)}
${step2}
3. Tell me which project you're on (id, current status, progress) before continuing with the actual work.

${TAIL}`;
}
