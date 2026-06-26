import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { EmailAttachmentInput } from "./types";

/**
 * Node-only filesystem conveniences.
 *
 * The Sendstack core is isomorphic and never touches the filesystem — the API
 * accepts strings (`html`/`text`) and base64 (`attachments`). These helpers do
 * the read-and-encode step so callers don't repeat it, and live in a separate
 * `@norialabs/sendstack/node` entrypoint so the core stays browser/edge-safe.
 */

/** Anything `fs.readFile` accepts as its first argument. */
export type PathLike = string | URL;

/** Read a UTF-8 file (e.g. an HTML template) into a string for `html`. */
export async function htmlFromFile(path: PathLike): Promise<string> {
  return await readFile(path, "utf8");
}

/** Read a UTF-8 file (e.g. a .txt body) into a string for `text`. */
export async function textFromFile(path: PathLike): Promise<string> {
  return await readFile(path, "utf8");
}

export interface AttachmentFromFileOptions {
  /** Override the attachment filename (defaults to the file's basename). */
  filename?: string;
  /** MIME type, e.g. "application/pdf". */
  contentType?: string;
  /** Inline the attachment (for embedded images referenced by `contentId`). */
  inline?: boolean;
  /** Content-ID for referencing an inline image from HTML (`cid:...`). */
  contentId?: string;
}

/**
 * Read a file from disk into a base64 `EmailAttachmentInput`, ready to drop
 * into `emails.send({ attachments: [...] })`.
 */
export async function attachmentFromFile(
  path: PathLike,
  options: AttachmentFromFileOptions = {},
): Promise<EmailAttachmentInput> {
  const data = await readFile(path);
  return attachmentFromBuffer(data, {
    filename: options.filename ?? basenameOf(path),
    contentType: options.contentType,
    inline: options.inline,
    contentId: options.contentId,
  });
}

export interface AttachmentFromBufferOptions {
  /** Required: there is no path to derive a filename from. */
  filename: string;
  contentType?: string;
  inline?: boolean;
  contentId?: string;
}

/**
 * Turn an in-memory Buffer/Uint8Array (e.g. a generated PDF) into a base64
 * `EmailAttachmentInput`. Use this when the content never hits disk.
 */
export function attachmentFromBuffer(
  data: Uint8Array,
  options: AttachmentFromBufferOptions,
): EmailAttachmentInput {
  const attachment: EmailAttachmentInput = {
    filename: options.filename,
    contentBase64: Buffer.from(data).toString("base64"),
  };

  if (options.contentType !== undefined) {
    attachment.contentType = options.contentType;
  }
  if (options.inline !== undefined) {
    attachment.inline = options.inline;
  }
  if (options.contentId !== undefined) {
    attachment.contentId = options.contentId;
  }

  return attachment;
}

function basenameOf(path: PathLike): string {
  return basename(typeof path === "string" ? path : path.pathname);
}
