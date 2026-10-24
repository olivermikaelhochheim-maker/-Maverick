import { ChatView } from "@/components/ChatView";
import { getMaverick, requireUser } from "@/lib/server";

export default async function ChatIndex({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const { q } = await searchParams;
  const conversations = await m.chat.conversations.list(user.id, 100);
  return (
    <ChatView
      key="new"
      conversations={conversations}
      initialMessages={[]}
      initialQuery={typeof q === "string" ? q.slice(0, 2000) : undefined}
      mode={m.providers.mode}
    />
  );
}
