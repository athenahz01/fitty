import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseServiceRoleClient } from "../lib/supabase-server";
import type { Database } from "../lib/types";

type CheckResult = {
  label: string;
  ok: boolean;
  detail?: string;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  count?: number | null;
  data: T | null;
  error: QueryError | null;
};

type Row = Record<string, unknown>;

type InsertBuilder = PromiseLike<QueryResult<null>> & {
  select(columns?: string): {
    single(): PromiseLike<QueryResult<Row>>;
  };
};

type HarnessDb = {
  from(table: string): {
    delete(options?: { count?: "exact" }): {
      eq(column: string, value: unknown): PromiseLike<QueryResult<null>>;
    };
    insert(values: unknown): InsertBuilder;
    select(columns?: string): {
      eq(column: string, value: unknown): PromiseLike<QueryResult<Row[]>>;
    };
    update(values: unknown): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          select(columns?: string): {
            single(): PromiseLike<QueryResult<Row>>;
          };
        };
      };
    };
  };
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<QueryResult<Row[]>>;
};

const requiredTarget = "staging";
const subjectAEmailPrefix = "admira-rls-a";
const subjectBEmailPrefix = "admira-rls-b";

function asHarnessDb(client: unknown) {
  return client as HarnessDb;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function requireAnonKey() {
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return anonKey;
}

function assertRequiredTarget() {
  if (process.env.ADMIRA_RLS_TARGET !== requiredTarget) {
    throw new Error("ADMIRA_RLS_TARGET=staging is required");
  }
}

function assertSafeTarget(supabaseUrl: string) {
  const parsed = new URL(supabaseUrl);
  const marker = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  const productionPattern = /(^|[-./])(prod|production|live)([-./]|$)/;
  if (productionPattern.test(marker)) {
    throw new Error(`Refusing to run against production-looking URL: ${supabaseUrl}`);
  }
}

async function insertSingle(db: HarnessDb, table: string, values: unknown) {
  const result = await db.from(table).insert(values).select("id").single();
  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? `Insert into ${table} failed`);
  }
  return result.data;
}

async function insertRows(db: HarnessDb, table: string, values: unknown) {
  const result = await db.from(table).insert(values);
  if (result.error) {
    throw new Error(result.error.message);
  }
}

async function selectById(db: HarnessDb, table: string, id: string | number) {
  const result = await db.from(table).select("id").eq("id", id);
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data ?? [];
}

async function deleteById(db: HarnessDb, table: string, id: string | number) {
  const result = await db.from(table).delete({ count: "exact" }).eq("id", id);
  return result;
}

async function deleteByColumn(
  db: HarnessDb,
  table: string,
  column: string,
  value: string | number,
) {
  const result = await db.from(table).delete({ count: "exact" }).eq(column, value);
  if (result.error) {
    throw new Error(result.error.message);
  }
}

async function expectRejected(
  db: HarnessDb,
  table: string,
  values: unknown,
) {
  const result = await db.from(table).insert(values).select("id").single();
  if (!result.error) {
    throw new Error(`Insert into ${table} unexpectedly succeeded`);
  }
}

async function runCheck(
  results: CheckResult[],
  label: string,
  assertion: () => Promise<void>,
) {
  try {
    await assertion();
    results.push({ label, ok: true });
    console.log(`PASS ${label}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown failure";
    results.push({ label, ok: false, detail });
    console.error(`FAIL ${label}: ${detail}`);
  }
}

async function createTestUser(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  email: string,
  password: string,
) {
  const result = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });

  if (result.error || !result.data.user) {
    throw new Error(result.error?.message ?? `Could not create ${email}`);
  }

  return result.data.user.id;
}

async function signInAs(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
) {
  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user) {
    throw new Error(result.error?.message ?? `Could not sign in ${email}`);
  }
  return client;
}

async function main() {
  assertRequiredTarget();
  const supabaseUrl = requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = requireAnonKey();
  assertSafeTarget(supabaseUrl);

  const runId = randomUUID();
  const password = `${randomUUID()}Aa1!`;
  const emailA = `${subjectAEmailPrefix}-${runId}@example.com`;
  const emailB = `${subjectBEmailPrefix}-${runId}@example.com`;
  const testUnitid = -Math.floor(100000000 + Math.random() * 800000000);
  const blockedSchoolUnitid = testUnitid - 1;
  const cohortVector = `[${Array.from({ length: 384 }, (_, index) =>
    index === 0 ? "1.00000000" : "0.00000000",
  ).join(",")}]`;
  const cohortSubjectIds = Array.from({ length: 5 }, () => randomUUID());
  const cohortConsentIds = Array.from({ length: 5 }, () => randomUUID());
  const cohortProfileIds = Array.from({ length: 5 }, () => randomUUID());
  const cohortOutcomeIds = Array.from({ length: 5 }, () => randomUUID());
  const service = createSupabaseServiceRoleClient();
  const serviceDb = asHarnessDb(service);
  const anonymousDb = asHarnessDb(
    createClient<Database>(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  );
  const results: CheckResult[] = [];
  const createdUserIds: string[] = [];
  let userAId = "";
  let userBId = "";
  let consentId = "";
  let profileId = "";
  let outcomeId = "";
  let commandTaskId = "";
  let requirementStatusId = "";
  let documentId = "";
  let fatalError: Error | null = null;
  let cleanupFailed = false;

  try {
    await insertRows(serviceDb, "schools", {
      unitid: testUnitid,
      name: `Admira RLS Harness ${runId}`,
      state: "TS",
      setting: "city",
      size: 1,
      admit_rate: 0.5,
      test_policy: "unknown",
      c7_factors: {},
      selectivity_tier: "accessible",
    });

    await runCheck(
      results,
      "Anonymous cannot execute similar cohort RPC",
      async () => {
        const result = await anonymousDb.rpc("match_similar_cohort", {
          p_profile_embedding: cohortVector,
          p_unitid: testUnitid,
          p_k: 5,
          p_match_count: 20,
        });
        if (!result.error) {
          throw new Error("anonymous similar cohort RPC unexpectedly succeeded");
        }
      },
    );

    await runCheck(results, "Anonymous cannot insert public school rows", async () => {
      await expectRejected(anonymousDb, "schools", {
        unitid: blockedSchoolUnitid,
        name: `Admira RLS Blocked School ${runId}`,
        state: "TS",
        country: "US",
        province_state: "TS",
        setting: "city",
        size: 1,
        admit_rate: 0.5,
        test_policy: "unknown",
        c7_factors: {},
        selectivity_tier: "accessible",
      });
    });

    await runCheck(
      results,
      "Anonymous cannot insert public program requirement rows",
      async () => {
        await expectRejected(anonymousDb, "program_requirements", {
          unitid: testUnitid,
          program_name: `Admira RLS Blocked Program ${runId}`,
          system: "direct",
          cutoff_basis: "percentage",
          source_url: "https://example.com/admira-rls-harness",
        });
      },
    );

    await runCheck(
      results,
      "Anonymous cannot insert compass major reference rows",
      async () => {
        await expectRejected(anonymousDb, "compass_majors", {
          major_name: `anon-major-${runId}`,
          median_earnings_10yr: 100000,
          source_url: "https://example.com/admira-rls-harness",
          provenance: "curated_public",
        });
      },
    );

    await runCheck(
      results,
      "Anonymous cannot insert compass career reference rows",
      async () => {
        await expectRejected(anonymousDb, "compass_careers", {
          major_name: `anon-major-${runId}`,
          career_title: "Blocked Career",
          median_wage_annual: 90000,
          source_url: "https://example.com/admira-rls-harness",
          provenance: "curated_public",
        });
      },
    );

    await runCheck(results, "Anonymous cannot insert command-center tasks", async () => {
      await expectRejected(anonymousDb, "tasks", {
        subject_id: randomUUID(),
        unitid: testUnitid,
        requirement_key: `anon-task-${runId}`,
        title: "Anonymous blocked task",
        category: "form",
        status: "todo",
        source_url: "https://example.com/admira-rls-harness",
      });
    });

    await runCheck(
      results,
      "Anonymous cannot insert command-center requirement status",
      async () => {
        await expectRejected(anonymousDb, "requirement_status", {
          subject_id: randomUUID(),
          unitid: testUnitid,
          requirement_key: `anon-status-${runId}`,
          status: "todo",
          source_url: "https://example.com/admira-rls-harness",
        });
      },
    );

    await runCheck(results, "Anonymous cannot insert document metadata", async () => {
      await expectRejected(anonymousDb, "documents", {
        subject_id: randomUUID(),
        unitid: testUnitid,
        requirement_key: `anon-document-${runId}`,
        storage_bucket: "admira-document-vault",
        storage_path: `${randomUUID()}/blocked.pdf`,
        file_name: "blocked.pdf",
        content_type: "application/pdf",
        size_bytes: 128,
      });
    });

    await runCheck(results, "Anonymous cannot list document vault", async () => {
      const result = await createClient<Database>(supabaseUrl, anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
        .storage
        .from("admira-document-vault")
        .list("anonymous");
      if (!result.error) {
        throw new Error("anonymous storage list unexpectedly succeeded");
      }
    });

    userAId = await createTestUser(service, emailA, password);
    userBId = await createTestUser(service, emailB, password);
    createdUserIds.push(userAId, userBId);

    const clientA = await signInAs(supabaseUrl, anonKey, emailA, password);
    const clientB = await signInAs(supabaseUrl, anonKey, emailB, password);
    const dbA = asHarnessDb(clientA);
    const dbB = asHarnessDb(clientB);

    const commandTask = await insertSingle(dbA, "tasks", {
      subject_id: userAId,
      unitid: testUnitid,
      requirement_key: `rls-${runId}:supplemental-app`,
      title: "Complete supplemental application",
      detail: "RLS harness task row.",
      category: "form",
      status: "todo",
      source_url: "https://example.com/admira-rls-harness",
    });
    commandTaskId = String(commandTask.id);

    const requirementStatus = await insertSingle(dbA, "requirement_status", {
      subject_id: userAId,
      unitid: testUnitid,
      requirement_key: `rls-${runId}:supplemental-app`,
      status: "in_progress",
      source_url: "https://example.com/admira-rls-harness",
    });
    requirementStatusId = String(requirementStatus.id);

    const document = await insertSingle(dbA, "documents", {
      subject_id: userAId,
      unitid: testUnitid,
      requirement_key: `rls-${runId}:supplemental-app`,
      storage_bucket: "admira-document-vault",
      storage_path: `${userAId}/rls-${runId}.pdf`,
      file_name: "rls-harness.pdf",
      content_type: "application/pdf",
      size_bytes: 128,
    });
    documentId = String(document.id);

    const consent = await insertSingle(dbA, "consent_records", {
      subject_id: userAId,
      consent_version: `rls-harness-${runId}`,
      consent_text:
        "I consent to this staging-only RLS harness storing temporary outcome test rows.",
      purpose: "real_outcome_modeling",
      revoked_at: null,
    });
    consentId = String(consent.id);

    const profile = await insertSingle(dbA, "applicant_profiles", {
      subject_id: userAId,
      consent_record_id: consentId,
      cycle_year: 2026,
      gpa: 3.9,
      course_rigor: "ap_ib_dual",
      sat_score: 1500,
      act_score: 34,
      test_submitted: true,
      activities_tier: "state",
      intended_major: "RLS Harness",
      application_round: "regular",
      demonstrated_interest: "moderate",
    });
    profileId = String(profile.id);

    const outcome = await insertSingle(dbA, "application_outcomes", {
      subject_id: userAId,
      profile_id: profileId,
      consent_record_id: consentId,
      unitid: testUnitid,
      outcome: "admitted",
      application_round: "regular",
      cycle_year: 2026,
    });
    outcomeId = String(outcome.id);

    const cohortConsentRows = cohortSubjectIds.map((subjectId, index) => ({
      id: cohortConsentIds[index],
      subject_id: subjectId,
      consent_version: `rls-sly-${runId}`,
      consent_text:
        "I consent to this staging-only RLS harness storing temporary k-anonymity cohort rows.",
      purpose: "real_outcome_modeling",
      revoked_at: null,
    }));
    const cohortProfileRows = cohortSubjectIds.map((subjectId, index) => ({
      id: cohortProfileIds[index],
      subject_id: subjectId,
      consent_record_id: cohortConsentIds[index],
      cycle_year: 2026,
      gpa: 3.8 + index * 0.01,
      course_rigor: "ap_ib_dual",
      sat_score: 1450 + index * 10,
      act_score: 32,
      test_submitted: true,
      activities_tier: "state",
      intended_major: "RLS Harness",
      application_round: "regular",
      demonstrated_interest: "moderate",
      profile_embedding: cohortVector,
      profile_embedding_model: "rls-harness-vector",
      provenance: "consented_user",
      source_url: null,
    }));
    const cohortOutcomeRows = cohortSubjectIds.map((subjectId, index) => ({
      id: cohortOutcomeIds[index],
      subject_id: subjectId,
      profile_id: cohortProfileIds[index],
      consent_record_id: cohortConsentIds[index],
      unitid: testUnitid,
      outcome: index < 3 ? "admitted" : "denied",
      application_round: "regular",
      cycle_year: 2026,
      provenance: "consented_user",
      source_url: null,
    }));

    await insertRows(serviceDb, "consent_records", cohortConsentRows.slice(0, 4));
    await insertRows(serviceDb, "applicant_profiles", cohortProfileRows.slice(0, 4));
    await insertRows(serviceDb, "application_outcomes", cohortOutcomeRows.slice(0, 4));

    await runCheck(
      results,
      "Similar cohort suppresses fewer than five consented records",
      async () => {
        const result = await serviceDb.rpc("match_similar_cohort", {
          p_profile_embedding: cohortVector,
          p_unitid: testUnitid,
          p_k: 5,
          p_match_count: 20,
        });
        if (result.error) {
          throw new Error(result.error.message);
        }
        if ((result.data ?? []).length !== 0) {
          throw new Error("sub-k similar cohort returned rows");
        }
      },
    );

    await insertRows(serviceDb, "consent_records", cohortConsentRows[4]);
    await insertRows(serviceDb, "applicant_profiles", cohortProfileRows[4]);
    await insertRows(serviceDb, "application_outcomes", cohortOutcomeRows[4]);

    await runCheck(
      results,
      "Similar cohort returns only k-anonymous aggregates",
      async () => {
        const result = await serviceDb.rpc("match_similar_cohort", {
          p_profile_embedding: cohortVector,
          p_unitid: testUnitid,
          p_k: 5,
          p_match_count: 20,
        });
        if (result.error) {
          throw new Error(result.error.message);
        }
        if ((result.data ?? []).length !== 1) {
          throw new Error(`expected 1 k-anonymous row, got ${result.data?.length ?? 0}`);
        }
        const serialized = JSON.stringify(result.data).toLowerCase();
        if (serialized.includes("subject_id") || serialized.includes("profile_id")) {
          throw new Error("similar cohort returned private identifiers");
        }
      },
    );

    const revokeCohortResult = await serviceDb
      .from("consent_records")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", cohortConsentIds[4])
      .eq("subject_id", cohortSubjectIds[4])
      .select("id")
      .single();
    if (revokeCohortResult.error) {
      throw new Error(revokeCohortResult.error.message);
    }

    await runCheck(
      results,
      "Revoked consent drops similar cohort below k immediately",
      async () => {
        const result = await serviceDb.rpc("match_similar_cohort", {
          p_profile_embedding: cohortVector,
          p_unitid: testUnitid,
          p_k: 5,
          p_match_count: 20,
        });
        if (result.error) {
          throw new Error(result.error.message);
        }
        if ((result.data ?? []).length !== 0) {
          throw new Error("revoked cohort row still appeared in similar cohort");
        }
      },
    );

    await runCheck(results, "User B cannot select User A consent row", async () => {
      const rows = await selectById(dbB, "consent_records", consentId);
      if (rows.length !== 0) {
        throw new Error(`expected 0 rows, got ${rows.length}`);
      }
    });

    await runCheck(results, "User B cannot select User A profile row", async () => {
      const rows = await selectById(dbB, "applicant_profiles", profileId);
      if (rows.length !== 0) {
        throw new Error(`expected 0 rows, got ${rows.length}`);
      }
    });

    await runCheck(results, "User B cannot select User A outcome row", async () => {
      const rows = await selectById(dbB, "application_outcomes", outcomeId);
      if (rows.length !== 0) {
        throw new Error(`expected 0 rows, got ${rows.length}`);
      }
    });

    await runCheck(results, "User B cannot select User A task row", async () => {
      const rows = await selectById(dbB, "tasks", commandTaskId);
      if (rows.length !== 0) {
        throw new Error(`expected 0 rows, got ${rows.length}`);
      }
    });

    await runCheck(
      results,
      "User B cannot select User A requirement status row",
      async () => {
        const rows = await selectById(dbB, "requirement_status", requirementStatusId);
        if (rows.length !== 0) {
          throw new Error(`expected 0 rows, got ${rows.length}`);
        }
      },
    );

    await runCheck(results, "User B cannot select User A document row", async () => {
      const rows = await selectById(dbB, "documents", documentId);
      if (rows.length !== 0) {
        throw new Error(`expected 0 rows, got ${rows.length}`);
      }
    });

    await runCheck(
      results,
      "User B cannot insert profile carrying User A subject_id",
      async () => {
        await expectRejected(dbB, "applicant_profiles", {
          subject_id: userAId,
          consent_record_id: consentId,
          cycle_year: 2026,
          gpa: 3.7,
          test_submitted: false,
          application_round: "regular",
        });
      },
    );

    await runCheck(
      results,
      "User B cannot insert outcome carrying User A subject_id",
      async () => {
        await expectRejected(dbB, "application_outcomes", {
          subject_id: userAId,
          profile_id: profileId,
          consent_record_id: consentId,
          unitid: testUnitid,
          outcome: "denied",
          application_round: "regular",
          cycle_year: 2026,
        });
      },
    );

    await runCheck(
      results,
      "User B cannot insert task carrying User A subject_id",
      async () => {
        await expectRejected(dbB, "tasks", {
          subject_id: userAId,
          unitid: testUnitid,
          requirement_key: `blocked-task-${runId}`,
          title: "Blocked task",
          category: "form",
          status: "todo",
          source_url: "https://example.com/admira-rls-harness",
        });
      },
    );

    await runCheck(
      results,
      "User B cannot insert requirement status carrying User A subject_id",
      async () => {
        await expectRejected(dbB, "requirement_status", {
          subject_id: userAId,
          unitid: testUnitid,
          requirement_key: `blocked-status-${runId}`,
          status: "todo",
          source_url: "https://example.com/admira-rls-harness",
        });
      },
    );

    await runCheck(
      results,
      "User B cannot insert document carrying User A subject_id",
      async () => {
        await expectRejected(dbB, "documents", {
          subject_id: userAId,
          unitid: testUnitid,
          requirement_key: `blocked-document-${runId}`,
          storage_bucket: "admira-document-vault",
          storage_path: `${userAId}/blocked-${runId}.pdf`,
          file_name: "blocked.pdf",
          content_type: "application/pdf",
          size_bytes: 128,
        });
      },
    );

    await runCheck(results, "User B cannot delete User A consent row", async () => {
      const result = await deleteById(dbB, "consent_records", consentId);
      if (!result.error && result.count !== 0) {
        throw new Error(`expected 0 deleted rows, got ${result.count}`);
      }
      const rows = await selectById(dbA, "consent_records", consentId);
      if (rows.length !== 1) {
        throw new Error("User A consent row was not preserved");
      }
    });

    await runCheck(results, "User B cannot delete User A profile row", async () => {
      const result = await deleteById(dbB, "applicant_profiles", profileId);
      if (!result.error && result.count !== 0) {
        throw new Error(`expected 0 deleted rows, got ${result.count}`);
      }
      const rows = await selectById(dbA, "applicant_profiles", profileId);
      if (rows.length !== 1) {
        throw new Error("User A profile row was not preserved");
      }
    });

    await runCheck(results, "User B cannot delete User A outcome row", async () => {
      const result = await deleteById(dbB, "application_outcomes", outcomeId);
      if (!result.error && result.count !== 0) {
        throw new Error(`expected 0 deleted rows, got ${result.count}`);
      }
      const rows = await selectById(dbA, "application_outcomes", outcomeId);
      if (rows.length !== 1) {
        throw new Error("User A outcome row was not preserved");
      }
    });

    await runCheck(results, "User B cannot delete User A task row", async () => {
      const result = await deleteById(dbB, "tasks", commandTaskId);
      if (!result.error && result.count !== 0) {
        throw new Error(`expected 0 deleted rows, got ${result.count}`);
      }
      const rows = await selectById(dbA, "tasks", commandTaskId);
      if (rows.length !== 1) {
        throw new Error("User A task row was not preserved");
      }
    });

    await runCheck(
      results,
      "User B cannot delete User A requirement status row",
      async () => {
        const result = await deleteById(dbB, "requirement_status", requirementStatusId);
        if (!result.error && result.count !== 0) {
          throw new Error(`expected 0 deleted rows, got ${result.count}`);
        }
        const rows = await selectById(dbA, "requirement_status", requirementStatusId);
        if (rows.length !== 1) {
          throw new Error("User A requirement status row was not preserved");
        }
      },
    );

    await runCheck(results, "User B cannot delete User A document row", async () => {
      const result = await deleteById(dbB, "documents", documentId);
      if (!result.error && result.count !== 0) {
        throw new Error(`expected 0 deleted rows, got ${result.count}`);
      }
      const rows = await selectById(dbA, "documents", documentId);
      if (rows.length !== 1) {
        throw new Error("User A document row was not preserved");
      }
    });

    const missingConsentId = randomUUID();
    await runCheck(
      results,
      "Profile insert without active consent is rejected",
      async () => {
        await expectRejected(dbA, "applicant_profiles", {
          subject_id: userAId,
          consent_record_id: missingConsentId,
          cycle_year: 2026,
          gpa: 3.6,
          test_submitted: false,
          application_round: "regular",
        });
      },
    );

    await runCheck(
      results,
      "Outcome insert without active consent is rejected",
      async () => {
        await expectRejected(dbA, "application_outcomes", {
          subject_id: userAId,
          profile_id: profileId,
          consent_record_id: missingConsentId,
          unitid: testUnitid,
          outcome: "denied",
          application_round: "regular",
          cycle_year: 2026,
        });
      },
    );

    const revokeResult = await serviceDb
      .from("consent_records")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", consentId)
      .eq("subject_id", userAId)
      .select("id")
      .single();
    if (revokeResult.error) {
      throw new Error(revokeResult.error.message);
    }

    await runCheck(
      results,
      "Profile insert after matching consent is revoked is rejected",
      async () => {
        await expectRejected(dbA, "applicant_profiles", {
          subject_id: userAId,
          consent_record_id: consentId,
          cycle_year: 2026,
          gpa: 3.5,
          test_submitted: false,
          application_round: "regular",
        });
      },
    );

    await runCheck(
      results,
      "Outcome insert after matching consent is revoked is rejected",
      async () => {
        await expectRejected(dbA, "application_outcomes", {
          subject_id: userAId,
          profile_id: profileId,
          consent_record_id: consentId,
          unitid: testUnitid,
          outcome: "waitlisted",
          application_round: "regular",
          cycle_year: 2026,
        });
      },
    );
  } catch (error) {
    fatalError = error instanceof Error ? error : new Error("unknown fatal error");
    console.error(`FAIL harness setup or execution: ${fatalError.message}`);
  } finally {
    const cleanupErrors: string[] = [];
    const scopedDeletes: Array<Promise<void>> = [];

    if (userAId) {
      scopedDeletes.push(deleteByColumn(serviceDb, "documents", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "requirement_status", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "tasks", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "consent_records", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "applicant_profiles", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "application_outcomes", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "data_access_logs", "subject_id", userAId));
    }
    if (userBId) {
      scopedDeletes.push(deleteByColumn(serviceDb, "documents", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "requirement_status", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "tasks", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "consent_records", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "applicant_profiles", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "application_outcomes", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "data_access_logs", "subject_id", userBId));
    }
    for (const subjectId of cohortSubjectIds) {
      scopedDeletes.push(deleteByColumn(serviceDb, "consent_records", "subject_id", subjectId));
      scopedDeletes.push(deleteByColumn(serviceDb, "applicant_profiles", "subject_id", subjectId));
      scopedDeletes.push(deleteByColumn(serviceDb, "application_outcomes", "subject_id", subjectId));
      scopedDeletes.push(deleteByColumn(serviceDb, "data_access_logs", "subject_id", subjectId));
    }
    const cleanupResults = await Promise.allSettled(scopedDeletes);
    cleanupResults.forEach((result) => {
      if (result.status === "rejected") {
        cleanupErrors.push(
          result.reason instanceof Error ? result.reason.message : "delete failed",
        );
      }
    });

    // Delete the temporary school only after the outcome rows that
    // reference it are gone, so the foreign key does not block cleanup.
    try {
      await deleteByColumn(serviceDb, "program_requirements", "unitid", testUnitid);
    } catch (error) {
      cleanupErrors.push(
        error instanceof Error ? error.message : "program_requirements delete failed",
      );
    }
    try {
      await deleteByColumn(serviceDb, "schools", "unitid", testUnitid);
    } catch (error) {
      cleanupErrors.push(
        error instanceof Error ? error.message : "schools delete failed",
      );
    }
    try {
      await deleteByColumn(serviceDb, "schools", "unitid", blockedSchoolUnitid);
    } catch (error) {
      cleanupErrors.push(
        error instanceof Error ? error.message : "blocked schools delete failed",
      );
    }

    for (const userId of createdUserIds) {
      const deleteUser = await service.auth.admin.deleteUser(userId);
      if (deleteUser.error) {
        cleanupErrors.push(deleteUser.error.message);
      }
    }

    if (cleanupErrors.length > 0) {
      cleanupFailed = true;
      cleanupErrors.forEach((message) => console.error(`FAIL cleanup: ${message}`));
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log("");
  console.log(
    `RLS verification summary: ${results.length - failed.length}/${results.length} checks passed`,
  );

  if (fatalError || failed.length > 0 || cleanupFailed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "RLS harness failed");
  process.exitCode = 1;
});
