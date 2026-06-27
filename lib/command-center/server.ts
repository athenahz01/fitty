import "server-only";

export const DOCUMENT_VAULT_BUCKET = "admira-document-vault";
export const DOCUMENT_VAULT_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_VAULT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function commandCenterEnabled() {
  return process.env.ADMIRA_COMMAND_CENTER_ENABLED === "true";
}

export function allowedDocumentContentType(value: string) {
  return DOCUMENT_VAULT_CONTENT_TYPES.includes(
    value as (typeof DOCUMENT_VAULT_CONTENT_TYPES)[number],
  );
}
