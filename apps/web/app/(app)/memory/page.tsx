import { MemoryVault } from "@/components/MemoryVault";
import { getMaverick, requireUser } from "@/lib/server";

export default async function MemoryPage() {
  const user = await requireUser();
  const m = await getMaverick();
  const memories = await m.deps.memory.list(user.id);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Memory Vault</h1>
          <p>
            Everything Maverick remembers about you, where it came from, and how long it&apos;s kept. Maverick&apos;s own guesses only land here after you approve
            them. Edit or delete anything.
          </p>
        </div>
      </div>
      <MemoryVault initial={memories} />
    </div>
  );
}
