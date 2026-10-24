import { apiUser, errorResponse, json } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ suggestions: await maverick.deps.suggestions.list(user.id, "pending") });
  } catch (err) {
    return errorResponse(err);
  }
}
