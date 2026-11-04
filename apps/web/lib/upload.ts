"use client";

/** A file as returned by the server after upload. */
export interface UploadedFile {
  id: string;
  name: string;
  kind: "pdf" | "image" | "text" | "docx";
  mediaType: string;
  sizeBytes: number;
  pages: number | null;
  tokenEstimate: number;
  createdAt: string;
}

export const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.log,.yaml,.yml,image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif";

/** Claude scales images to about this size anyway, so bigger only costs upload time. */
const MAX_EDGE = 1568;
const SHRINK_ABOVE_BYTES = 3.5 * 1024 * 1024;

/**
 * Shrink large photos (and convert iPhone HEIC to JPEG where the browser can decode it)
 * before upload. Everything else passes through untouched.
 */
export async function prepareFile(file: File): Promise<File> {
  const isHeic = /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  const isRaster = /^image\/(jpeg|png|webp)$/i.test(file.type);
  if (!isHeic && !isRaster) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (!isHeic && longEdge <= MAX_EDGE * 1.3 && file.size <= SHRINK_ABOVE_BYTES) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, MAX_EDGE / longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // the server will explain if it can't accept it
  }
}

/** Upload with progress. Resolves with the stored file or rejects with the server's message. */
export function uploadFile(file: File, onProgress?: (fraction: number) => void): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: { file?: UploadedFile; error?: string; code?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* fall through */
      }
      if (xhr.status === 401) window.location.href = "/login";
      if (xhr.status >= 200 && xhr.status < 300 && data.file) resolve(data.file);
      else reject(new Error(data.error ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check the connection."));
    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `~${Math.round(n / 1000)}k tokens` : `~${n} tokens`;
}

export const KIND_ICON: Record<UploadedFile["kind"], string> = { pdf: "📄", image: "🖼️", text: "📝", docx: "📃" };
