import { apiUser, errorResponse, json } from "@/lib/server";

/** Which memories were given to the model for this reply, and why. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ context: await maverick.deps.memory.contextFor(user.id, (await params).id) });
  } catch (err) {
    return errorResponse(err);
  }
}
