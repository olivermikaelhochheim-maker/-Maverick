import { ChatView } from "@/components/ChatView";
import { getMaverick, requireUser } from "@/lib/server";

export default async function ChatIndex({ searchParams }: { searchParams: Promise<{ q?: string; file?: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const { q, file } = await searchParams;
  // "Ask Maverick about this" from the Files page.
  const initialFile = typeof file === "string" ? await m.deps.files.get(user.id, file) : null;
  const conversations = await m.chat.conversations.list(user.id, 100);
  return (
    <ChatView
      key="new"
      conversations={conversations}
      initialMessages={[]}
      initialQuery={typeof q === "string" ? q.slice(0, 2000) : undefined}
      initialFiles={initialFile ? [initialFile] : undefined}
      mode={m.providers.mode}
    />
  );
}
