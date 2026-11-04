import { FilesLibrary } from "@/components/FilesLibrary";
import { getMaverick, requireUser } from "@/lib/server";

export default async function FilesPage() {
  const user = await requireUser();
  const m = await getMaverick();
  const [files, totalBytes] = await Promise.all([m.deps.files.list(user.id), m.deps.files.totalBytes(user.id)]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Files</h1>
          <p>
            Documents and images you&apos;ve shared with Maverick. Tap <strong>Ask Maverick</strong> to start a conversation about one. Maverick reads a file only in
            conversations where you attach it.
          </p>
        </div>
      </div>
      <FilesLibrary initial={files} totalBytes={totalBytes} />
    </div>
  );
}
