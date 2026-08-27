/** Canonical chat prompts behind the dashboard's copy buttons. Edit here, then
 *  rebuild (`npm --prefix ui run build`). */

const PROJECTS_DIR = 'O:\\CGI\\R_n_D\\work.steph\\projects';

const TAIL = `For the rest of this chat, keep the project updated without being asked: check off tasks as they finish, add tasks if scope grows, append a timestamped log entry at each milestone or when the session wraps up, and commit the projects folder (git add -A plus a one-line message).

Never put secrets, credentials, or client-confidential details in those files.`;

export const NEW_PROJECT_PROMPT = `Project tracking: this chat is starting a new project that must be tracked in my project manager.

1. Read ${PROJECTS_DIR}\\PROTOCOL.md and follow it exactly.
2. Create a new project folder there: lowercase kebab-case folder name (that is the permanent project id), a project.md based on _templates\\project.md with name, status, horizon, urgency, summary and a milestone-sized task checklist filled in, and a log.md with a first timestamped entry (get the timestamp from the shell, never guess it).
3. Tell me the project id you chose and the summary you wrote.

${TAIL}`;

export function addProjectPrompt(projectId?: string): string {
  const step2 = projectId
    ? `2. This chat's work belongs to the project "${projectId}". Read its project.md and log.md for context before doing anything else.`
    : `2. List the project folders there and decide which one this chat's work belongs to. Read that project's project.md and log.md for context before doing anything else. If nothing fits, ask me whether to create a new folder instead.`;
  return `Project tracking: the work in this chat belongs to an existing project in my project manager.

1. Read ${PROJECTS_DIR}\\PROTOCOL.md and follow it exactly.
${step2}
3. Tell me which project you're on (id, current status, progress) before continuing with the actual work.

${TAIL}`;
}
