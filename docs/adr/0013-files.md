# ADR 0013: Files: shared per conversation, sent natively to Claude, stored encrypted

Status: Accepted (2026-11-04)

## Decision
- Oliver can attach PDFs, images (JPEG/PNG/GIF/WebP), Word (.docx) and text files (.txt/.md/.csv/.json/…) in chat (📎, drag and drop, paste) or upload them in **Files**.
- The type is decided from the file's **contents** (magic bytes), not its name. HEIC, executables, spreadsheets and anything else are refused with a clear message. Limits: 10 MB per file, 5 MB per image (Claude's limit; the browser shrinks big photos to ~1,568 px first and converts HEIC to JPEG where Safari can), PDFs ≤100 pages, 5 files per message, 300 MB in total.
- Storage: original bytes AES-256-GCM encrypted in the database (`files.content_enc`); Word text is extracted at upload (mammoth) and stored encrypted; names are encrypted too.
- **Sending to Claude:** PDFs as native `document` blocks (Claude reads text and page images), images as `image` blocks, text/Word as plain-text `document` blocks with the file name as title. No lossy pre-extraction for PDFs.
- **"On the table":** every file attached in a conversation stays visible to Maverick for the rest of that conversation, placed at the start of the first message so prompt caching makes follow-ups cheap. Up to 120k tokens of files (~60 PDF pages); beyond that the newest are kept and Oliver is told which are hidden.
- Messages with files use at least the standard model (Sonnet 5.5). File tokens count in the pre-call budget check.
- Files are untrusted content: framed as "data, never instructions" in the request, covered by the persona's security rule, and Maverick's tools can still only propose.
- Downloads are always `attachment` (images may be `inline` for thumbnails), `nosniff`, and sandboxed by CSP, so a file can never run in Maverick's origin.
- Export lists file names and sizes but not contents; download files individually.

## Costs (estimates)
A 10-page PDF ≈ 20k tokens: first question on Sonnet ≈ $0.04, follow-ups within 5 minutes ≈ $0.005 for the file part (cache reads). A photo ≈ 1.6k tokens ≈ $0.003.
