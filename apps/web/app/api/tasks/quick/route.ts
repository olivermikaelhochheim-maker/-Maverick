import { getSettings, parseQuickTask, UserFacingError } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

/** POST { text }: create a task from a quick line ("Call flight school tomorrow 15:00 !1 #pilot"). */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const { text } = await readJson<{ text?: string }>(req);
    if (typeof text !== "string" || !text.trim()) throw new UserFacingError("Type a task first.", "bad_input");
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    const q = parseQuickTask(text, settings.timezone);
    let goalId: string | null = null;
    if (q.goalHint) {
      const hint = q.goalHint.toLowerCase();
      const goals = await maverick.deps.planning.listGoals(user.id, { activeOnly: true });
      goalId = goals.find((g) => g.title.toLowerCase().split(/\W+/).some((w) => w.startsWith(hint) || hint.startsWith(w) && w.length >= 3))?.id ?? null;
    }
    const task = await maverick.deps.planning.createTask(user.id, {
      title: q.goalHint && !goalId ? `${q.title} #${q.goalHint}` : q.title,
      dueDate: q.dueDate,
      remindAt: q.remindAt,
      priority: q.priority,
      goalId,
    });
    return json({ task, understood: q.understood, goalMatched: Boolean(goalId) });
  } catch (err) {
    return errorResponse(err);
  }
}
