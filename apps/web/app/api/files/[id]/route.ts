import { UserFacingError } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Download a file. Images can be shown inline (?inline=1) for thumbnails; everything
 * else is always a download, and nothing is ever served as HTML, so a file can't run code here.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const found = await maverick.deps.files.content(user.id, (await params).id);
    if (!found) throw new UserFacingError("File not found.", "not_found", 404);
    const { file, bytes } = found;
    const inline = new URL(req.url).searchParams.get("inline") === "1" && file.kind === "image";
    const type = file.kind === "docx" || file.kind === "pdf" || file.kind === "image" ? file.mediaType : "text/plain; charset=utf-8";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    await maverick.deps.files.delete(user.id, (await params).id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
