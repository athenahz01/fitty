import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  allowedDocumentContentType,
  commandCenterEnabled,
  DOCUMENT_VAULT_BUCKET,
  DOCUMENT_VAULT_MAX_BYTES,
} from "@/lib/command-center/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function safeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "document"
  );
}

async function requireSubjectId(
  request: Request,
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid bearer token.");
  }

  return data.user.id;
}

export async function POST(request: Request) {
  if (!commandCenterEnabled()) {
    return NextResponse.json(
      { error: "Application Command Center is not enabled." },
      { status: 404 },
    );
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Supabase configuration is missing.",
      },
      { status: 500 },
    );
  }

  let subjectId: string;
  try {
    subjectId = await requireSubjectId(request, supabase);
  } catch {
    return NextResponse.json(
      { error: "A signed-in owner is required." },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload must be multipart form data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > DOCUMENT_VAULT_MAX_BYTES) {
    return NextResponse.json(
      { error: "File must be between 1 byte and 5 MB." },
      { status: 400 },
    );
  }

  if (!allowedDocumentContentType(file.type)) {
    return NextResponse.json(
      { error: "Unsupported document type." },
      { status: 400 },
    );
  }

  const unitidValue = formData.get("unitid");
  const unitid =
    typeof unitidValue === "string" && unitidValue.trim()
      ? Number(unitidValue)
      : null;
  if (unitid !== null && (!Number.isInteger(unitid) || unitid <= 0)) {
    return NextResponse.json({ error: "unitid must be an integer." }, { status: 400 });
  }

  const requirementKeyValue = formData.get("requirement_key");
  const requirementKey =
    typeof requirementKeyValue === "string" && requirementKeyValue.trim()
      ? requirementKeyValue.trim().slice(0, 240)
      : null;
  const fileName = safeFileName(file.name);
  const storagePath = `${subjectId}/${randomUUID()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_VAULT_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Unable to upload document." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      subject_id: subjectId,
      unitid,
      requirement_key: requirementKey,
      storage_bucket: DOCUMENT_VAULT_BUCKET,
      storage_path: storagePath,
      file_name: fileName,
      content_type: file.type,
      size_bytes: file.size,
    })
    .select(
      "id,unitid,requirement_key,file_name,content_type,size_bytes,status,created_at",
    )
    .single();

  if (error) {
    await supabase.storage.from(DOCUMENT_VAULT_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: "Unable to save document metadata." },
      { status: 500 },
    );
  }

  return NextResponse.json({ document: data });
}
