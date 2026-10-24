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
      }))}
      mode={m.providers.mode}
    />
  );
}
