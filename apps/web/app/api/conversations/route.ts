import { apiUser, errorResponse, json } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ conversations: await maverick.chat.conversations.list(user.id, 100) });
  } catch (err) {
    return errorResponse(err);
  }
}
