import { MAX_FILE_BYTES, UserFacingError } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ files: await maverick.deps.files.list(user.id), totalBytes: await maverick.deps.files.totalBytes(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Upload one file (multipart form field "file"). */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_FILE_BYTES + 64 * 1024) throw new UserFacingError("That file is larger than 10 MB.", "file_too_large", 413);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new UserFacingError("Upload failed. Try again.", "bad_upload");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new UserFacingError("No file received.", "bad_upload");
    if (file.size > MAX_FILE_BYTES) throw new UserFacingError(`"${file.name}" is larger than 10 MB.`, "file_too_large", 413);
    const stored = await maverick.deps.files.upload(user.id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    return json({ file: stored });
  } catch (err) {
    return errorResponse(err);
  }
}
