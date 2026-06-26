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

    userAId = await createTestUser(service, emailA, password);
    userBId = await createTestUser(service, emailB, password);
    createdUserIds.push(userAId, userBId);

    const clientA = await signInAs(supabaseUrl, anonKey, emailA, password);
    const clientB = await signInAs(supabaseUrl, anonKey, emailB, password);
    const dbA = asHarnessDb(clientA);
    const dbB = asHarnessDb(clientB);

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
      scopedDeletes.push(deleteByColumn(serviceDb, "consent_records", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "applicant_profiles", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "application_outcomes", "subject_id", userAId));
      scopedDeletes.push(deleteByColumn(serviceDb, "data_access_logs", "subject_id", userAId));
    }
    if (userBId) {
      scopedDeletes.push(deleteByColumn(serviceDb, "consent_records", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "applicant_profiles", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "application_outcomes", "subject_id", userBId));
      scopedDeletes.push(deleteByColumn(serviceDb, "data_access_logs", "subject_id", userBId));
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
