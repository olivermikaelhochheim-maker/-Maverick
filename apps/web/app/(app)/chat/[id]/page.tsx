import { notFound } from "next/navigation";
import { UserFacingError } from "@maverick/core";
import { ChatView } from "@/components/ChatView";
import { getMaverick, requireUser } from "@/lib/server";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const { id } = await params;
  let messages;
  try {
    messages = await m.chat.conversations.messages(user.id, id);
  } catch (err) {
    if (err instanceof UserFacingError && err.status === 404) notFound();
    throw err;
  }
  const conversations = await m.chat.conversations.list(user.id, 100);
  // Re-attach each suggestion to the reply it came from: the first assistant message saved after it.
  const suggestions = await m.deps.suggestions.forConversation(user.id, id);
  const byMessage = new Map<string, { id: string; kind: string; title: string; decided?: "accepted" | "dismissed" }[]>();
  for (const sg of suggestions) {
    const owner = messages.find((x) => x.role === "assistant" && x.createdAt >= sg.createdAt);
    if (!owner) continue;
    const decided = sg.status === "accepted" ? "accepted" : sg.status === "pending" ? undefined : "dismissed";
    byMessage.set(owner.id, [...(byMessage.get(owner.id) ?? []), { id: sg.id, kind: sg.kind, title: sg.title, decided }]);
  }
  return (
    <ChatView
      key={id}
      conversations={conversations}
      conversationId={id}
      initialMessages={messages.map((x) => ({
        id: x.id,
        role: x.role,
        content: x.content,
        status: x.status,
        model: x.model,
        routeReason: x.routeReason,
        costUsd: x.costUsd,
        latencyMs: x.latencyMs,
        suggestions: byMessage.get(x.id),
      }))}
      mode={m.providers.mode}
    />
  );
}
