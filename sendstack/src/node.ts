import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { EmailAttachmentInput } from "./types";

export type PathLike = string | URL;

export async function htmlFromFile(path: PathLike): Promise<string> {
  return await readFile(path, "utf8");
}

export async function textFromFile(path: PathLike): Promise<string> {
  return await readFile(path, "utf8");
}

export interface AttachmentFromFileOptions {
  filename?: string;
  contentType?: string;
  inline?: boolean;
  contentId?: string;
}

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
  filename: string;
  contentType?: string;
  inline?: boolean;
  contentId?: string;
}

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
