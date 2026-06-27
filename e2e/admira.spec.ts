import { expect, test, type Page } from "@playwright/test";

const mitChanceResponse = {
  school: {
    unitid: 166683,
    name: "Massachusetts Institute of Technology",
    selectivity_tier: "elite",
    sat_25: 1520,
    sat_75: 1580,
    act_25: 34,
    act_75: 36,
    gpa_avg: null,
    test_policy: "required",
  },
  probability: {
    point: 0.0403255,
    calibrated: 0.032967,
    low: 0,
    high: 0.492967,
    width: 0.492967,
    coverage: 0.8,
  },
  band: {
    label: "reach",
    wide_band: true,
    note: "Public data cannot narrow this interval enough for a target/likely label.",
    input_confidence: "standard",
  },
  levers: {
    controllable: [
      {
        feature: "test_score",
        label: "Test score",
        note: "Can still move if the student has another SAT or ACT sitting before application deadlines.",
        logit_contribution: -0.061,
      },
      {
        feature: "application_round",
        label: "Application round",
        note: "Early strategy can change the school-specific odds context.",
        logit_contribution: -0.012,
      },
    ],
    fixed: [
      {
        feature: "gpa_to_date",
        label: "GPA to date",
        note: "Most of the academic record is already set by application season.",
        logit_contribution: 0,
      },
    ],
    unseen: [
      {
        feature: "essays",
        label: "Essays",
        note: "Public data cannot evaluate writing quality or application narrative.",
      },
      {
        feature: "recommendations",
        label: "Recommendations",
        note: "Teacher and counselor letters are not visible in the public-data model.",
      },
      {
        feature: "institutional_priorities",
        label: "Institutional priorities",
        note: "Major balance, class-shaping needs, and yield goals are not directly observable.",
      },
      {
        feature: "demonstrated_interest",
        label: "Demonstrated interest",
        note: "Some schools consider engagement, but public data rarely captures student-specific evidence.",
      },
    ],
  },
  climb_levers: [
    {
      id: "test_score",
      label: "Test score",
      kind: "modeled_delta",
      direction: "Reruns the existing chance model with a higher submitted score.",
      note: "Scenario uses SAT plus 50 points, capped at 1600.",
      delta: { low: 0.01, high: 0.03, tick: 0.02 },
    },
    {
      id: "application_round",
      label: "Application round",
      kind: "direction_only",
      direction:
        "Could matter at some schools, but no usable published ED/RD spread is loaded here.",
      note: "Admira does not invent an ED or EA number when the published rates are missing.",
    },
    {
      id: "essays",
      label: "Essays",
      kind: "direction_only",
      direction: "Can narrow the real outcome range, but is not in this model yet.",
      note: "Public data cannot evaluate writing quality or application narrative.",
    },
    {
      id: "recommendations",
      label: "Recommendations",
      kind: "direction_only",
      direction: "Can narrow the real outcome range, but is not in this model yet.",
      note: "Teacher and counselor letters are not visible in the public-data model.",
    },
    {
      id: "demonstrated_interest",
      label: "Demonstrated interest",
      kind: "direction_only",
      direction: "Can narrow the real outcome range, but is not in this model yet.",
      note: "Student-specific engagement evidence is not sent to this model.",
    },
  ],
  rubric: {
    c7_factors: {
      _source: "2023-24 CDS Common Data Set",
      rigor: "Very Important",
      gpa: "Very Important",
      test_scores: "Very Important",
      essay: "Important",
      recommendations: "Important",
      extracurriculars: "Important",
    },
    gaps: {
      sat: { score: 1540, mid: 1550, gap: -0.22483333333333333 },
      act: { score: 35, mid: 35, gap: 0 },
      gpa: { score: 3.95, mid: null, gap: null },
    },
  },
  disclaimers: [
    "Synthetic public-data prior - not validated real-outcome accuracy.",
    "Essays, recommendations, and institutional priorities are not modeled.",
  ],
  model: {
    type: "public_prior_logistic_v1",
    version: "2026.06.16-phase2",
    honesty_label: "Synthetic public-data prior. Not validated real-outcome accuracy.",
  },
};

const mitWhatIfResponse = {
  ...mitChanceResponse,
  probability: {
    point: 0.091,
    calibrated: 0.081,
    low: 0.03,
    high: 0.58,
    width: 0.55,
    coverage: 0.8,
  },
  band: {
    ...mitChanceResponse.band,
    note: "Public data still keeps this interval wide after the modeled score change.",
  },
  rubric: {
    ...mitChanceResponse.rubric,
    gaps: {
      ...mitChanceResponse.rubric.gaps,
      sat: { score: 1590, mid: 1550, gap: 0.402 },
    },
  },
};

const testBlindChanceResponse = {
  ...mitChanceResponse,
  school: {
    ...mitChanceResponse.school,
    test_policy: "blind",
  },
  climb_levers: mitChanceResponse.climb_levers.map((lever) =>
    lever.id === "test_score"
      ? {
          ...lever,
          direction: "This school does not use submitted scores in the model.",
          note: "Test-blind policy means the test-score scenario is disabled.",
          delta: { low: 0, high: 0, tick: 0 },
        }
      : lever,
  ),
};

const fitFinderResponse = {
  query: {
    embedded: true,
    dim: 384,
    model: "Xenova/all-MiniLM-L6-v2",
  },
  results: [
    {
      school: {
        unitid: 166683,
        name: "Massachusetts Institute of Technology",
        region: "Northeast",
        size_band: "large",
        setting: "city",
        selectivity_tier: "elite",
        net_price_avg: 22000,
        sticker_cost: 82000,
        program_areas: ["Computer and information sciences", "Engineering"],
      },
      match_reasons: {
        matched: [
          "region",
          "size",
          "setting",
          "cost within ceiling",
          "programs: computer and information sciences",
        ],
        notable: ["completion 0.94", "median earnings 10yr 95000"],
        cost_status: "within_ceiling",
      },
      probability: {
        point: 0.0403255,
        calibrated: 0.032967,
        low: 0,
        high: 0.492967,
        width: 0.492967,
        coverage: 0.8,
      },
      band: {
        label: "reach",
        wide_band: true,
      },
      fit_score: {
        score: 82,
        axes: [
          {
            key: "academics",
            label: "Academics",
            value: 76,
            typical: 84,
            status: "good",
            note: "GPA and submitted test scores are compared with the school's public middle 50 or average.",
          },
          {
            key: "major",
            label: "Major",
            value: 91,
            typical: 84,
            status: "good",
            note: "Program overlap uses the pinned Fit Finder embedding model.",
          },
          {
            key: "selectivity",
            label: "Selectivity",
            value: 63,
            typical: 84,
            status: "caution",
            note: "Academic strength is compared with the elite selectivity tier.",
          },
          {
            key: "interest",
            label: "Interest",
            value: 86,
            typical: 84,
            status: "good",
            note: "Interest overlap uses the school document similarity.",
          },
          {
            key: "rigor",
            label: "Rigor",
            value: 78,
            typical: 84,
            status: "caution",
            note: "Thin proxy from academic signal and CDS rigor rating.",
          },
        ],
        coverage: {
          known: 5,
          total: 5,
          label: "5/5 axes",
          reduced: false,
        },
        method: "equal_weight_known_axis_mean",
        model: {
          id: "Xenova/all-MiniLM-L6-v2",
          dim: 384,
        },
        note: "FIT is a profile-overlap score, not an admit probability.",
      },
      climb_levers: [
        {
          id: "test_score",
          label: "Test score",
          kind: "modeled_delta",
          direction: "Reruns the existing chance model with a higher submitted score.",
          note: "Scenario uses SAT plus 50 points, capped at 1600.",
          delta: { low: 0.01, high: 0.03, tick: 0.02 },
        },
        {
          id: "application_round",
          label: "Application round",
          kind: "direction_only",
          direction:
            "Could matter at some schools, but no usable published ED/RD spread is loaded here.",
          note: "Admira does not invent an ED or EA number when the published rates are missing.",
        },
        {
          id: "essays",
          label: "Essays",
          kind: "direction_only",
          direction: "Can narrow the real outcome range, but is not in this model yet.",
          note: "Public data cannot evaluate writing quality or application narrative.",
        },
        {
          id: "recommendations",
          label: "Recommendations",
          kind: "direction_only",
          direction: "Can narrow the real outcome range, but is not in this model yet.",
          note: "Teacher and counselor letters are not visible in the public-data model.",
        },
        {
          id: "demonstrated_interest",
          label: "Demonstrated interest",
          kind: "direction_only",
          direction: "Can narrow the real outcome range, but is not in this model yet.",
          note: "Student-specific engagement evidence is not sent to this model.",
        },
      ],
    },
  ],
  balance: {
    reach: 1,
    target: 0,
    likely: 0,
    note: "All returned schools landed in reach based on the chancing ranges.",
  },
  disclaimers: [
    "Fit uses published attributes only; campus culture and social fit are not modeled.",
    "Affordability uses published net price or sticker cost. Merit aid is not predicted.",
    "Chances are calibrated ranges, not guarantees.",
  ],
};

const mitAdmitIntelligenceResponse = {
  score: 3,
  tier: "Reach",
  drivers: [
    {
      label: "School selectivity",
      direction: "negative",
      impact: 2.12,
      detail: "School selectivity pulls against the calibrated read.",
    },
    {
      label: "Test score",
      direction: "positive",
      impact: 0.18,
      detail: "Test score supports the calibrated read.",
    },
    {
      label: "Application round",
      direction: "neutral",
      impact: 0,
      detail: "Application round is neutral in the calibrated read.",
    },
  ],
  confidence: 0.51,
  country: "US",
  profile: {
    method:
      "US axes compare submitted academics to CDS C9-C12-style score bands and C7 importance ratings.",
    axes: [
      {
        key: "academics",
        label: "Academics",
        value: 78,
        admitted: 78,
        status: "steady",
        note: "GPA and submitted tests against loaded admitted-student bands.",
      },
      {
        key: "rigor",
        label: "Rigor",
        value: 82,
        admitted: 78,
        status: "steady",
        note: "Academic read blended with the school's CDS rigor rating.",
      },
      {
        key: "test",
        label: "Test",
        value: 85,
        admitted: 76,
        status: "strong",
        note: "Submitted SAT/ACT against the public middle 50 where available.",
      },
      {
        key: "extracurricular",
        label: "Extracurricular Impact",
        value: 71,
        admitted: 74,
        status: "steady",
        note: "Activity context blended with CDS extracurricular importance.",
      },
      {
        key: "fit",
        label: "Fit",
        value: 72,
        admitted: 72,
        status: "steady",
        note: "Intended major presence against the school context available today.",
      },
    ],
  },
  probability: {
    calibrated: 0.032967,
    low: 0,
    high: 0.492967,
    width: 0.492967,
    coverage: 0.8,
  },
};

const waterlooAdmitIntelligenceResponse = {
  score: 48,
  tier: "Target",
  drivers: [
    {
      label: "Admission average",
      direction: "positive",
      impact: 2,
      detail: "92 percentage vs 90-93 published band.",
    },
    {
      label: "Prerequisites",
      direction: "positive",
      impact: 0,
      detail: "100% of loaded prerequisites matched.",
    },
    {
      label: "Broad-based review",
      direction: "negative",
      impact: 0.03,
      detail: "Supplemental or broad-based review tempers a cutoff-only read.",
    },
  ],
  confidence: 0.79,
  country: "CA",
  program: {
    name: "Computer Science",
    source_url: "https://www.ouinfo.ca/programs/example/cs",
    cutoff: {
      low: 90,
      high: 93,
      basis: "percentage",
    },
  },
  profile: {
    method:
      "Canada axes compare applicant average to the program cutoff band in its native basis, with prerequisites and broad-based flags from program_requirements.",
    axes: [
      {
        key: "academics",
        label: "Academics",
        value: 75,
        admitted: 76,
        status: "steady",
        note: "Applicant average against the published program cutoff band.",
      },
      {
        key: "rigor",
        label: "Rigor",
        value: 84,
        admitted: 76,
        status: "strong",
        note: "Loaded prerequisite match for the selected Canadian program.",
      },
      {
        key: "test",
        label: "Test",
        value: 72,
        admitted: 72,
        status: "steady",
        note: "Canadian seed rows do not require SAT/ACT for this cutoff read.",
      },
      {
        key: "extracurricular",
        label: "Extracurricular Impact",
        value: 70,
        admitted: 72,
        status: "steady",
        note: "Activity context matters most when broad-based review is flagged.",
      },
      {
        key: "fit",
        label: "Fit",
        value: 68,
        admitted: 74,
        status: "stretch",
        note: "Program-level fit from the selected requirement row and review system.",
      },
    ],
  },
  probability: {
    calibrated: 0.48,
  },
};

const authUser = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "student@example.com",
  email_confirmed_at: "2026-06-18T00:00:00.000Z",
  phone: "",
  confirmed_at: "2026-06-18T00:00:00.000Z",
  last_sign_in_at: "2026-06-18T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-06-18T00:00:00.000Z",
  updated_at: "2026-06-18T00:00:00.000Z",
};

const testAccessToken = "test-access-token";
const consentRecordId = "11111111-1111-4111-8111-111111111111";
const profileRecordId = "22222222-2222-4222-8222-222222222222";
const outcomeRecordId = "33333333-3333-4333-8333-333333333333";
const revokedAt = "2026-06-18T01:00:00.000Z";
const consentVersion = "phase-7-capture-ui-v2-privacy-consent-2026-06-22";

const exportedOutcomeData = {
  consent_records: [
    {
      id: consentRecordId,
      subject_id: authUser.id,
      consent_version: consentVersion,
      consent_text: "Test consent text long enough for export coverage.",
      purpose: "real_outcome_modeling",
      consented_at: "2026-06-18T00:00:00.000Z",
      revoked_at: null,
      created_at: "2026-06-18T00:00:00.000Z",
    },
  ],
  applicant_profiles: [
    {
      id: profileRecordId,
      subject_id: authUser.id,
      consent_record_id: consentRecordId,
      cycle_year: 2026,
    },
  ],
  application_outcomes: [
    {
      id: outcomeRecordId,
      subject_id: authUser.id,
      profile_id: profileRecordId,
      consent_record_id: consentRecordId,
      unitid: 166683,
      outcome: "admitted",
    },
  ],
  data_access_logs: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      subject_id: authUser.id,
      action: "exported",
      row_count: 3,
    },
  ],
};

function expectNoForbiddenKeys(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();

  expect(serialized).not.toContain("race");
  expect(serialized).not.toContain("ethnicity");
  expect(serialized).not.toContain("ethnic_origin");
  expect(serialized).not.toContain("racial_identity");
}

async function mockOutcomeStatus(page: Page, enabled: boolean) {
  await page.route("**/api/outcomes/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled }),
    });
  });
}

async function mockFitStatus(page: Page, enabled: boolean) {
  await page.route("**/api/fit/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled }),
    });
  });
}

async function mockAdmitIntelligenceStatus(page: Page, enabled: boolean) {
  await page.route("**/api/admit-intelligence/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled }),
    });
  });
}

async function mockStudentsLikeYouStatus(page: Page, enabled: boolean) {
  await page.route("**/api/students-like-you/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled }),
    });
  });
}

async function mockClimbStatus(page: Page, enabled: boolean) {
  await page.route("**/api/climb/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled }),
    });
  });
}

async function mockCommandCenterStatus(page: Page, enabled: boolean) {
  await page.route("**/api/command-center/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled }),
    });
  });
}

async function mockSupabaseAuth(page: Page) {
  const corsHeaders = {
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
  };

  await page.route("https://admira-test.supabase.co/auth/v1/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }

    const url = route.request().url();

    if (url.includes("/token?grant_type=password")) {
      await route.fulfill({
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          access_token: testAccessToken,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "test-refresh-token",
          user: authUser,
        }),
      });
      return;
    }

    if (url.includes("/user")) {
      await route.fulfill({
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify(authUser),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({}),
    });
  });
}

async function signInOutcomePanel(page: Page) {
  const captureFlow = page.getByTestId("outcome-capture-flow");
  await captureFlow.getByLabel("Email").fill("student@example.com");
  await captureFlow.getByLabel("Password").fill("correct-horse-battery-staple");
  await captureFlow.getByRole("button", { name: "Sign in" }).click();
  await expect(captureFlow.getByText("Signed in")).toBeVisible();
  return captureFlow;
}

async function mockFitFinder(page: Page) {
  await page.route("**/api/fit", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body).toMatchObject({
      interests: "robotics and computing",
      intended_major: "Computer science",
      preferred_region: "Northeast",
      preferred_size: "large",
      preferred_setting: "city",
      cost_ceiling: 30000,
      learning_style_notes: "project labs",
      sat_score: 1540,
      act_score: 35,
      gpa: 3.95,
      application_round: "regular",
    });
    expectNoForbiddenKeys(body);

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fitFinderResponse),
    });
  });
}

async function fillFitFinderForm(page: Page) {
  const finder = page.getByTestId("fit-finder-panel");
  await finder.getByLabel("Interests").fill("robotics and computing");
  await finder.getByLabel("Intended major").fill("Computer science");
  await finder
    .getByRole("group", { name: "Preferred size" })
    .getByRole("button", { name: "large" })
    .click();
  await finder
    .getByRole("group", { name: "Preferred setting" })
    .getByRole("button", { name: "city" })
    .click();
  await finder
    .getByRole("group", { name: "Preferred region" })
    .getByRole("button", { name: "Northeast" })
    .click();
  await finder.getByLabel("Published cost ceiling").fill("30000");
  await finder.getByLabel("Learning notes").fill("project labs");
  await finder.getByRole("button", { name: "Find schools" }).click();
  // Results render as a collapsed ranked list; expand the school to reveal the
  // detailed card (radar, range, levers).
  await finder
    .getByRole("button", { name: /Massachusetts Institute of Technology/ })
    .click();
  return finder;
}

async function addMitResult(page: Page) {
  await page.goto("/");
  await page.getByLabel("GPA").fill("3.95");
  await page.getByLabel("SAT").fill("1540");
  await page.getByRole("textbox", { exact: true, name: "ACT" }).fill("35");
  await page.getByLabel("Intended major").fill("Computer science");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByLabel("Search by school name").fill("Massachusetts");
  await page
    .getByRole("button", { name: /Massachusetts Institute of Technology/ })
    .click();

  const resultCard = page.getByTestId("result-card");
  await expect(resultCard).toContainText(
    "Massachusetts Institute of Technology",
  );
  return resultCard;
}

test.beforeEach(async ({ page }) => {
  await mockStudentsLikeYouStatus(page, false);
  await mockClimbStatus(page, false);
  await mockCommandCenterStatus(page, false);

  await page.route("**/api/chance", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");

    expect(body).toMatchObject({
      act_score: 35,
      application_round: "regular",
      gpa: 3.95,
      sat_score: 1540,
      unitid: 166683,
    });
    expect(body).not.toHaveProperty("activityNote");
    expect(body).not.toHaveProperty("homeState");
    expect(body).not.toHaveProperty("intendedMajor");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(mitChanceResponse),
    });
  });
});

test("keeps outcome capture closed when the server flag is disabled", async ({
  page,
}) => {
  let captureRequests = 0;

  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await page.route(
    /\/api\/outcomes\/(consent|profile|application|export-my-data|revoke-consent|delete-my-data)$/,
    async (route) => {
      captureRequests += 1;
      await route.abort();
    },
  );

  await page.goto("/");

  await expect(page.getByTestId("outcome-capture-closed")).toContainText(
    "Outcome capture is not currently open",
  );
  await expect(page.getByTestId("outcome-capture-flow")).toHaveCount(0);
  await expect(page.getByTestId("outcome-data-controls")).toHaveCount(0);
  expect(captureRequests).toBe(0);
});

test("keeps Fit Finder dark when the server flag is disabled", async ({
  page,
}) => {
  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await page.route("**/api/fit", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 404,
      body: JSON.stringify({ error: "Fit Finder is not enabled." }),
    });
  });
  await page.route("**/api/fit/explain", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 404,
      body: JSON.stringify({ error: "Fit Finder is not enabled." }),
    });
  });

  await page.goto("/");

  await expect(page.getByTestId("fit-finder-panel")).toHaveCount(0);

  const statuses = await page.evaluate(async () => {
    const fit = await fetch("/api/fit", { method: "POST", body: "{}" });
    const explain = await fetch("/api/fit/explain", {
      method: "POST",
      body: "{}",
    });
    return { fit: fit.status, explain: explain.status };
  });
  expect(statuses).toEqual({ fit: 404, explain: 404 });
});

test("moves the what-if range while keeping the current range visible", async ({
  page,
}) => {
  const chanceBodies: Record<string, unknown>[] = [];

  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await page.unroute("**/api/chance");
  await page.route("**/api/chance", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    chanceBodies.push(body);
    expectNoForbiddenKeys(body);
    expect(body).not.toHaveProperty("activityNote");
    expect(body).not.toHaveProperty("homeState");
    expect(body).not.toHaveProperty("intendedMajor");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        body.sat_score === 1590 ? mitWhatIfResponse : mitChanceResponse,
      ),
    });
  });

  const resultCard = await addMitResult(page);
  const panel = resultCard.getByTestId("what-if-panel");
  await expect(panel).toContainText("Current 0-49%");
  await expect(panel.getByTestId("scenario-range")).toHaveAttribute(
    "aria-label",
    /Current 0-49%/,
  );
  await expect(panel.getByLabel(/GPA/i)).toHaveCount(0);
  await expect(panel.getByLabel(/essay|interest|rec/i)).toHaveCount(0);

  const satSlider = panel.getByLabel("What-if SAT score");
  await satSlider.focus();
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press("ArrowRight");
  }

  await expect(panel).toContainText("What-if: SAT 1540 -> 1590");
  await expect(panel).toContainText("What-if 3-58%");
  await expect(panel).toContainText("Current 0-49%");
  await expect(panel).toContainText("marker +5 pts");
  await expect(panel.getByText(/^8%$/)).toHaveCount(0);
  await expect(panel.getByTestId("scenario-range")).toHaveAttribute(
    "aria-label",
    /what-if 3-58%/,
  );
  expect(
    chanceBodies.some(
      (body) =>
        body.unitid === 166683 &&
        body.sat_score === 1590 &&
        body.application_round === "regular",
    ),
  ).toBe(true);
});

test("disables the test-score what-if control for test-blind schools", async ({
  page,
}) => {
  const chanceBodies: Record<string, unknown>[] = [];

  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await page.unroute("**/api/chance");
  await page.route("**/api/chance", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    chanceBodies.push(body);
    expectNoForbiddenKeys(body);

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(testBlindChanceResponse),
    });
  });

  const resultCard = await addMitResult(page);
  const panel = resultCard.getByTestId("what-if-panel");
  await expect(panel.getByLabel("What-if SAT score")).toBeDisabled();
  await expect(panel.getByLabel("What-if ACT score")).toBeDisabled();
  await expect(panel).toContainText("test-blind: scores not used");
  await page.waitForTimeout(300);
  expect(chanceBodies).toHaveLength(1);
});

test("renders privacy policy and links it from the consent flow", async ({
  page,
}) => {
  await page.goto("/privacy");

  await expect(page).toHaveTitle(/Privacy & Consent \| Admira/);
  await expect(
    page.getByRole("heading", { name: "Privacy & Consent Policy" }),
  ).toBeVisible();
  const policyPage = page.locator("body");
  await expect(policyPage).toContainText("Effective date");
  await expect(policyPage).toContainText("June 22, 2026");
  await expect(policyPage).toContainText(
    "Race and ethnicity are never collected or used",
  );
  await expect(policyPage).toContainText(
    "Browsing, searching schools, and getting chance ranges do not collect personal data",
  );
  await expect(policyPage).toContainText("Analytics are off by default");
  await expect(policyPage).toContainText(
    "Users under 13 are not permitted to share outcome data without verifiable parental consent",
  );
  await expect(page.getByRole("heading", { name: "Terms for using Admira." })).toBeVisible();

  await mockOutcomeStatus(page, true);
  await mockFitStatus(page, false);
  await mockSupabaseAuth(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Privacy" }).first()).toHaveAttribute(
    "href",
    "/privacy",
  );
  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute(
    "href",
    "/privacy#terms",
  );

  const captureFlow = await signInOutcomePanel(page);
  await expect(captureFlow.getByTestId("outcome-consent-text")).toContainText(
    "privacy-consent-2026-06-22",
  );
  const policyLink = captureFlow.getByRole("link", {
    name: /privacy & consent policy/i,
  });
  await expect(policyLink).toHaveAttribute("href", "/privacy");
  await policyLink.click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("records consent, profile, and one outcome through the enabled capture flow", async ({
  page,
}) => {
  const captureBodies: Record<string, unknown> = {};

  await mockOutcomeStatus(page, true);
  await mockFitStatus(page, false);
  await mockSupabaseAuth(page);
  await page.route(/\/api\/outcomes\/(consent|profile|application)$/, async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${testAccessToken}`);
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    expectNoForbiddenKeys(body);

    const url = route.request().url();
    if (url.endsWith("/api/outcomes/consent")) {
      captureBodies.consent = body;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ consent_record: { id: consentRecordId } }),
      });
      return;
    }

    if (url.endsWith("/api/outcomes/profile")) {
      captureBodies.profile = body;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ applicant_profile: { id: profileRecordId } }),
      });
      return;
    }

    captureBodies.outcome = body;
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({ application_outcome: { id: outcomeRecordId } }),
    });
  });

  await page.goto("/");

  const captureFlow = await signInOutcomePanel(page);

  const consentCopy = await captureFlow.getByTestId("outcome-consent-text").innerText();
  const consentCheckbox = captureFlow.getByLabel(
    "I agree to share these optional records with Admira.",
  );
  await expect(consentCheckbox).not.toBeChecked();
  await expect(
    captureFlow.getByRole("button", { name: "Record consent" }),
  ).toBeDisabled();
  await consentCheckbox.check();
  await captureFlow.getByRole("button", { name: "Record consent" }).click();

  await captureFlow.getByLabel("Cycle year", { exact: true }).fill("2026");
  await captureFlow.getByLabel("GPA").fill("3.92");
  await captureFlow.getByLabel("Intended major").fill("Computer science");
  await captureFlow
    .getByRole("group", { name: "Course rigor" })
    .getByRole("button", { name: "AP, IB, or dual enrollment" })
    .click();
  await captureFlow.getByLabel("SAT").fill("1510");
  await captureFlow.getByRole("textbox", { exact: true, name: "ACT" }).fill("34");
  await captureFlow
    .getByRole("group", { name: "Activities tier" })
    .getByRole("button", { name: "State" })
    .click();
  await captureFlow
    .getByRole("group", { name: "Demonstrated interest" })
    .getByRole("button", { name: "Moderate" })
    .click();
  await captureFlow.getByRole("button", { name: "Save profile" }).click();

  await captureFlow.getByLabel("Outcome school").fill("Massachusetts");
  await captureFlow
    .getByRole("button", { name: /Massachusetts Institute of Technology/ })
    .click();
  await captureFlow.getByLabel("Outcome cycle year").fill("2026");
  await captureFlow.getByRole("button", { name: "Save outcome" }).click();

  await expect(captureFlow.getByTestId("saved-outcomes")).toContainText(
    "Massachusetts Institute of Technology: Admitted",
  );
  await expect(captureFlow).not.toContainText(/race|ethnicity/i);

  expect(captureBodies.consent).toEqual({
    consent_version: consentVersion,
    consent_text: consentCopy,
    purpose: "real_outcome_modeling",
  });
  expect(captureBodies.profile).toMatchObject({
    consent_record_id: consentRecordId,
    cycle_year: 2026,
    gpa: 3.92,
    course_rigor: "ap_ib_dual",
    sat_score: 1510,
    act_score: 34,
    test_submitted: true,
    activities_tier: "state",
    intended_major: "Computer science",
    application_round: "regular",
    demonstrated_interest: "moderate",
  });
  expect(captureBodies.outcome).toEqual({
    profile_id: profileRecordId,
    consent_record_id: consentRecordId,
    unitid: 166683,
    outcome: "admitted",
    application_round: "regular",
    cycle_year: 2026,
  });
});

test("exports, revokes, and deletes signed-in outcome data with confirmation", async ({
  page,
}) => {
  let exportRequests = 0;
  let revokeBody: Record<string, unknown> | null = null;
  let deleteRequests = 0;

  await mockOutcomeStatus(page, true);
  await mockFitStatus(page, false);
  await mockSupabaseAuth(page);
  await page.route("**/api/outcomes/export-my-data", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${testAccessToken}`);
    exportRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(exportedOutcomeData),
    });
  });
  await page.route("**/api/outcomes/revoke-consent", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${testAccessToken}`);
    revokeBody = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        consent_record: {
          ...exportedOutcomeData.consent_records[0],
          revoked_at: revokedAt,
        },
      }),
    });
  });
  await page.route("**/api/outcomes/delete-my-data", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().headers().authorization).toBe(`Bearer ${testAccessToken}`);
    deleteRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        deleted: {
          consent_records: 1,
          applicant_profiles: 1,
          application_outcomes: 1,
          data_access_logs: 2,
        },
      }),
    });
  });

  await page.goto("/");
  await signInOutcomePanel(page);

  const controls = page.getByTestId("outcome-data-controls");
  await expect(controls).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await controls.getByRole("button", { name: "Export my data" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("admira-my-data.json");
  expect(exportRequests).toBe(1);
  await expect(controls).toContainText(consentVersion);

  await controls.getByRole("button", { name: "Revoke" }).click();
  expect(revokeBody).toEqual({ consent_record_id: consentRecordId });
  await expect(controls).toContainText("Consent revoked");
  await expect(
    controls.getByText("No active consent records were found."),
  ).toBeVisible();

  const deleteButton = controls.getByRole("button", { name: "Delete my data" });
  await expect(controls).toContainText("It cannot be undone");
  await expect(deleteButton).toBeDisabled();
  await controls.getByLabel("Type DELETE to confirm").fill("DEL");
  await expect(deleteButton).toBeDisabled();
  expect(deleteRequests).toBe(0);

  await controls.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  expect(deleteRequests).toBe(1);
  await expect(controls.getByTestId("delete-counts")).toContainText(
    "1 consent records",
  );
  await expect(controls.getByTestId("delete-counts")).toContainText("2 access logs");
});

test("runs Fit Finder, renders grounded prose, and adds a school to the list", async ({
  page,
}) => {
  let explainRequests = 0;

  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, true);
  await mockFitFinder(page);
  await page.route("**/api/fit/explain", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expectNoForbiddenKeys(body);
    expect(body).toMatchObject({
      school: {
        unitid: 166683,
        name: "Massachusetts Institute of Technology",
      },
      match_reasons: {
        cost_status: "within_ceiling",
      },
      band: {
        label: "reach",
        low: 0,
        high: 0.492967,
      },
    });
    explainRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        available: true,
        model: "claude-haiku-4-5-20251001",
        explanation:
          "This school fits the stated preferences through the region, size, setting, and computing program matches. The chance label remains reach, with the range shown on the card rather than a single admit number.",
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("GPA").fill("3.95");
  await page.getByLabel("SAT").fill("1540");
  await page.getByRole("textbox", { exact: true, name: "ACT" }).fill("35");

  const finder = await fillFitFinderForm(page);

  await expect(finder.getByTestId("fit-result-card")).toContainText(
    "Massachusetts Institute of Technology",
  );
  const fitCard = finder.getByTestId("fit-result-card");
  await expect(fitCard).toContainText("0-49%");
  await expect(fitCard).toContainText("FIT 82");
  await expect(fitCard).toContainText(
    "Great fit, a genuine reach. FIT 82 is profile overlap, not chance.",
  );
  await expect(finder.getByTestId("fit-score-panel")).toBeVisible();
  await expect(finder.locator(".fit-radar svg")).toBeVisible();
  await expect(finder.getByTestId("reach-ladder")).toBeVisible();
  await expect(finder.getByTestId("climb-levers")).toContainText(
    "See how to move this range",
  );
  await expect(finder.getByTestId("climb-levers")).toContainText(
    "not in the model yet",
  );
  await expect(finder.getByTestId("cannot-see-panel")).toContainText("Essays");
  await expect(finder.getByTestId("cannot-see-panel")).toContainText(
    "That is why the band stays wide.",
  );
  await expect(fitCard.locator("details.result-details")).not.toHaveAttribute(
    "open",
    "",
  );
  await fitCard.locator("details.result-details summary").click();
  await expect(fitCard).toContainText("programs: computer and information sciences");
  await expect(fitCard).toContainText("This school fits the stated preferences");
  await expect(fitCard).toContainText("Shareable view");
  await expect(finder.getByTestId("fit-balance")).toContainText(
    "All returned schools landed in reach",
  );
  await expect(finder).toContainText("Merit aid is not predicted");
  await expect(finder).not.toContainText(
    new RegExp(`${["match", "%"].join(" ")}|${["match", "percent"].join(" ")}`, "i"),
  );
  await expect(page.getByText(/your chance/i)).toHaveCount(0);
  expect(explainRequests).toBe(1);

  await finder.getByRole("button", { name: "Add to my Admira list" }).click();
  await expect(page.getByTestId("result-card")).toContainText(
    "Massachusetts Institute of Technology",
  );
});

test("keeps Fit Finder cards useful when Claude explanation falls back", async ({
  page,
}) => {
  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, true);
  await mockFitFinder(page);
  await page.route("**/api/fit/explain", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        available: false,
        explanation: null,
        reason: "Claude explanation is not configured.",
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("GPA").fill("3.95");
  await page.getByLabel("SAT").fill("1540");
  await page.getByRole("textbox", { exact: true, name: "ACT" }).fill("35");

  const finder = await fillFitFinderForm(page);
  const fitCard = finder.getByTestId("fit-result-card");
  await fitCard.locator("details.result-details summary").click();

  await expect(fitCard).toContainText(
    "programs: computer and information sciences",
  );
  await expect(fitCard).toContainText(
    "Claude explanation is not configured.",
  );
  await expect(fitCard).toContainText(
    "Published cost only",
  );
});

test("renders Admit Intelligence for a US school when the flag is enabled", async ({
  page,
}) => {
  let admitRequests = 0;

  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await mockAdmitIntelligenceStatus(page, true);
  await page.route("**/api/admit-intelligence", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body).toMatchObject({
      unitid: 166683,
      sat_score: 1540,
      act_score: 35,
      gpa: 3.95,
      application_round: "regular",
      intended_major: "Computer science",
      activity_context: "Robotics captain and research internship.",
    });
    expect(body).not.toHaveProperty("activityNote");
    expect(body).not.toHaveProperty("homeState");
    expect(body).not.toHaveProperty("intendedMajor");
    expectNoForbiddenKeys(body);
    admitRequests += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(mitAdmitIntelligenceResponse),
    });
  });

  await page.goto("/");
  await expect(page.getByText("Profile Studio").first()).toBeVisible();
  await page.getByLabel("GPA").fill("3.95");
  await page.getByLabel("SAT").fill("1540");
  await page.getByRole("textbox", { exact: true, name: "ACT" }).fill("35");
  await page.getByLabel("Intended major").fill("Computer science");
  await page
    .getByPlaceholder(/Robotics captain/)
    .fill("Robotics captain and research internship.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByLabel("Search by school name").fill("Massachusetts");
  await page
    .getByRole("button", { name: /Massachusetts Institute of Technology/ })
    .click();

  const card = page.getByTestId("admit-card");
  await expect(card).toContainText("Admit Intelligence");
  await expect(card).toContainText("Reach at 3/100");
  await expect(card).toContainText("Model confidence");
  await expect(card).toContainText("School selectivity");
  await expect(card.getByTestId("profile-studio")).toContainText(
    "Five-axis profile read",
  );
  await expect(card.locator(".profile-studio-radar svg")).toBeVisible();
  await expect(page.getByTestId("result-card")).toHaveCount(0);
  expect(admitRequests).toBe(1);
});

test("renders Admit Intelligence for a Canadian program when the flag is enabled", async ({
  page,
}) => {
  let admitRequests = 0;

  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await mockAdmitIntelligenceStatus(page, true);
  await page.route("**/api/admit-intelligence", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body).toMatchObject({
      unitid: 900001,
      applicant_average: 92,
      applicant_basis: "percentage",
      completed_prerequisites: ["ENG4U", "MHF4U", "MCV4U"],
      program_name: "Computer Science",
      intended_major: "Computer Science",
      activity_context: "AIF, robotics, and math contests.",
    });
    expectNoForbiddenKeys(body);
    admitRequests += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(waterlooAdmitIntelligenceResponse),
    });
  });

  await page.goto("/");
  await expect(page.getByText("Profile Studio").first()).toBeVisible();
  await page.getByLabel("Intended major").fill("Computer Science");
  await page.getByLabel("Canadian average").fill("92");
  await page
    .getByLabel("Completed prerequisites")
    .fill("ENG4U, MHF4U, MCV4U");
  await page
    .getByPlaceholder(/Robotics captain/)
    .fill("AIF, robotics, and math contests.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByLabel("Search by school name").fill("Waterloo");
  await page
    .getByRole("button", { name: /University of Waterloo/ })
    .click();

  const card = page.getByTestId("admit-card");
  await expect(card).toContainText("University of Waterloo");
  await expect(card).toContainText("Target at 48/100");
  await expect(card).toContainText("Computer Science - cutoff 90-93 percentage");
  await expect(card).toContainText("Admission average");
  await expect(card).toContainText("Prerequisites");
  await expect(card.locator(".profile-studio-radar svg")).toBeVisible();
  expect(admitRequests).toBe(1);
});

test("renders Students-Like-You k-safe aggregates when the flag is enabled", async ({
  page,
}) => {
  let slyRequests = 0;

  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await mockAdmitIntelligenceStatus(page, false);
  await mockStudentsLikeYouStatus(page, true);
  await page.route("**/api/students-like-you", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body).toMatchObject({
      profile: {
        cycle_year: 2026,
        gpa: 3.95,
        sat_score: 1540,
        act_score: 35,
        test_submitted: true,
        intended_major: "Computer science",
        application_round: "regular",
      },
    });
    expect(JSON.stringify(body)).not.toContain("Robotics captain");
    expect(body.profile).not.toHaveProperty("activity_context");
    expectNoForbiddenKeys(body);
    slyRequests += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "ready",
        k: 5,
        query: {
          embedded: true,
          dim: 384,
          model: "Xenova/all-MiniLM-L6-v2",
        },
        cohorts: [
          {
            unitid: 166683,
            school_name: "Massachusetts Institute of Technology",
            cohort_size: 5,
            outcomes: {
              admitted: 2,
              denied: 2,
              waitlisted: 1,
              deferred: 0,
            },
            rates: {
              admitted: 0.4,
              denied: 0.4,
              waitlisted: 0.2,
              deferred: 0,
            },
            attribute_cards: [
              { kind: "gpa", label: "GPA band", value: "3.75-3.99", count: 5 },
              { kind: "rigor", label: "Course rigor", value: "AP IB Dual", count: 5 },
            ],
            admit_insights: [
              { label: "Admitted rigor", value: "Most Rigorous", count: 5 },
            ],
            provenance: {
              curated_public: 5,
              consented_user: 0,
              source_urls: ["https://mitadmissions.org/apply/process/stats/"],
            },
          },
        ],
        feedback: {
          enabled: false,
          reason: "Feedback loop is off.",
        },
      }),
    });
  });

  await page.goto("/");
  const panel = page.getByTestId("sly-panel");
  await expect(panel).toContainText("Students Like You");
  await page.getByLabel("GPA").fill("3.95");
  await page.getByLabel("SAT").fill("1540");
  await page.getByRole("textbox", { exact: true, name: "ACT" }).fill("35");
  await page.getByLabel("Intended major").fill("Computer science");
  await page
    .getByPlaceholder(/Robotics captain/)
    .fill("Robotics captain and research internship.");
  await panel.getByTestId("sly-run").click();

  await expect(panel.getByTestId("sly-results")).toContainText(
    "Massachusetts Institute of Technology",
  );
  await expect(panel.getByTestId("sly-results")).toContainText(
    "5 similar records",
  );
  await expect(panel).toContainText("GPA band");
  await expect(panel.getByTestId("sly-insights")).toContainText("Most Rigorous");
  expect(slyRequests).toBe(1);
});

test("renders Students-Like-You sub-k empty state when SQL suppresses the cohort", async ({
  page,
}) => {
  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await mockAdmitIntelligenceStatus(page, false);
  await mockStudentsLikeYouStatus(page, true);
  await page.route("**/api/students-like-you", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "empty",
        k: 5,
        message: "Not enough similar students yet.",
        query: {
          embedded: true,
          dim: 384,
          model: "Xenova/all-MiniLM-L6-v2",
        },
        cohorts: [],
        feedback: {
          enabled: false,
          reason: "Feedback loop is off.",
        },
      }),
    });
  });

  await page.goto("/");
  const panel = page.getByTestId("sly-panel");
  await panel.getByTestId("sly-run").click();
  await expect(panel.getByTestId("sly-empty")).toContainText(
    "Not enough similar students yet.",
  );
  await expect(panel.getByTestId("sly-empty")).toContainText(
    "Minimum cohort size: 5",
  );
});

test("renders Climb Roadmap computed deltas when the flag is enabled", async ({
  page,
}) => {
  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await mockAdmitIntelligenceStatus(page, false);
  await mockClimbStatus(page, true);
  await page.route("**/api/climb", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body).toMatchObject({
      profile: {
        sat_score: 1540,
        act_score: 35,
        gpa: 3.95,
        application_round: "regular",
      },
      schools: [{ unitid: 166683 }],
    });
    expect(JSON.stringify(body)).not.toContain("Robotics captain");
    expect(body.profile).not.toHaveProperty("activity_context");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        snapshot_key: "climb:test",
        method: "score(after) - score(before)",
        schools: [
          {
            school: {
              unitid: 166683,
              name: "Massachusetts Institute of Technology",
            },
            current: {
              score: 3,
              tier: "Reach",
              probability: 0.032967,
            },
            moves: [],
          },
        ],
        ranked_moves: [
          {
            id: "166683:test_score",
            school: {
              unitid: 166683,
              name: "Massachusetts Institute of Technology",
            },
            lever: {
              feature: "test_score",
              label: "Test score",
              kind: "controllable",
            },
            before: {
              score: 3,
              tier: "Reach",
              probability: 0.032967,
            },
            after: {
              score: 6,
              tier: "Reach",
              probability: 0.061,
            },
            delta_score: 3,
            crosses_tier: false,
            tier_claim: null,
            counterfactual: {
              sat_score: 1590,
            },
            direction: "Rerun the public-prior scorer with SAT 50 points higher.",
            note: "Computed by rescoring this exact school.",
          },
        ],
        context: [
          {
            feature: "essays",
            label: "Essays",
            kind: "unseen",
            note: "Context only.",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("GPA").fill("3.95");
  await page.getByLabel("SAT").fill("1540");
  await page.getByRole("textbox", { exact: true, name: "ACT" }).fill("35");
  await page.getByLabel("Activities and context").fill("Robotics captain");
  await page.getByLabel("Intended major").fill("Computer science");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByLabel("Search by school name").fill("Massachusetts");
  await page
    .getByRole("button", { name: /Massachusetts Institute of Technology/ })
    .click();

  const panel = page.getByTestId("climb-panel");
  await panel.getByTestId("climb-run").click();
  await expect(panel.getByTestId("climb-results")).toContainText("Test score");
  await expect(panel.getByTestId("climb-results")).toContainText("+3");
  await expect(panel.getByTestId("climb-results")).toContainText("3 → 6");
  await expect(panel.getByTestId("climb-results")).toContainText(
    "Essays: context only",
  );
});

test("renders Command Center requirements and deadline-not-loaded state", async ({
  page,
}) => {
  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await mockAdmitIntelligenceStatus(page, false);
  await mockCommandCenterStatus(page, true);
  await page.route("**/api/command-center", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body).toMatchObject({
      schools: [{ unitid: 166683 }],
    });

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        progress: {
          total: 2,
          done: 1,
          percent: 50,
        },
        schools: [
          {
            school: {
              unitid: 166683,
              name: "Massachusetts Institute of Technology",
              country: "US",
              admission_system: "direct",
            },
            tasks: [
              {
                id: "166683:testing",
                unitid: 166683,
                program_requirement_id: null,
                requirement_key: "testing",
                title: "Submit required test scores",
                detail: "Loaded requirement from the school row.",
                category: "testing",
                status: "done",
                due_date: null,
                source_url: "https://example.com/requirements",
              },
              {
                id: "166683:supplement",
                unitid: 166683,
                program_requirement_id: null,
                requirement_key: "supplement",
                title: "Complete supplemental application",
                detail: "Loaded requirement from program_requirements.",
                category: "form",
                status: "todo",
                due_date: null,
                source_url: "https://example.com/requirements",
              },
            ],
            deadline: {
              status: "not_loaded",
              label: "Deadline not loaded",
            },
          },
        ],
        documents: [],
      }),
    });
  });

  await addMitResult(page);
  const panel = page.getByTestId("command-center-panel");
  await panel.getByTestId("command-center-run").click();
  await expect(panel.getByTestId("command-center-results")).toContainText(
    "1/2 complete",
  );
  await expect(panel.getByTestId("command-center-results")).toContainText(
    "Deadline not loaded",
  );
  await expect(panel.getByTestId("command-center-results")).toContainText(
    "Complete supplemental application",
  );
  await expect(panel.getByTestId("command-center-results")).toContainText(
    "0 uploaded",
  );
});

test("renders an honest elite-school result and methodology disclosure", async ({
  page,
}) => {
  await mockOutcomeStatus(page, false);
  await mockFitStatus(page, false);
  await page.goto("/");

  await expect(page).toHaveTitle(/Fit and Honest Chance \| Admira/);
  await page.getByLabel("GPA").fill("3.95");
  await page.getByLabel("SAT").fill("1540");
  await page.getByRole("textbox", { exact: true, name: "ACT" }).fill("35");
  await page.getByLabel("Intended major").fill("Computer science");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByTestId("profile-summary")).toContainText("GPA 3.95");
  await page.getByLabel("Search by school name").fill("Massachusetts");
  await page
    .getByRole("button", { name: /Massachusetts Institute of Technology/ })
    .click();

  const resultCard = page.getByTestId("result-card");
  await expect(resultCard).toContainText(
    "Massachusetts Institute of Technology",
  );
  await expect(resultCard).toContainText(
    "Strong academic read, but a genuine reach.",
  );
  await expect(page.getByTestId("range-band")).toBeVisible();
  await expect(page.getByTestId("reach-ladder")).toBeVisible();
  await expect(page.getByText("See how to move this range")).toBeVisible();
  await expect(page.getByTestId("cannot-see-panel")).toContainText("Interest");
  await expect(page.getByTestId("cannot-see-panel")).toContainText(
    "That is why the band stays wide.",
  );
  await expect(page.getByTestId("fit-score-panel")).toHaveCount(0);
  await expect(resultCard.locator("details.result-details")).not.toHaveAttribute(
    "open",
    "",
  );
  await resultCard.locator("details.result-details summary").click();
  await expect(page.getByText("What this school values")).toBeVisible();
  await expect(page.getByText("Data notes")).toBeVisible();
  await expect(page.getByText("Source: 2023-24 CDS Common Data Set")).toBeVisible();
  await expect(page.getByText("SAT 1540 vs 1520-1580")).toBeVisible();
  await expect(page.getByText("Shareable view")).toBeVisible();

  await expect(page.getByTestId("sub20-note")).toContainText(
    "Sub-20 limit",
  );
  await expect(page.getByText(/Public data cannot narrow this interval/)).toBeVisible();
  await expect(page.getByTestId("balance-warning")).toContainText(
    "Every school on your list is a reach",
  );
  await expect(
    page.getByRole("button", { name: "Balance my list" }),
  ).toBeVisible();
  await expect(page.getByText(/your chance/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();

  await page
    .locator("header")
    .getByRole("link", { exact: true, name: "Methodology" })
    .click();
  await expect(page).toHaveURL(/\/methodology$/);
  await expect(page).toHaveTitle(/Methodology \| Admira/);
  await expect(
    page.getByRole("heading", { name: /hard accuracy ceiling/i }),
  ).toBeVisible();
  await expect(page.getByText(/below 20% admit rate/i)).toBeVisible();
  await expect(page.getByText(/Synthetic public-data prior/i).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Race and ethnicity are never used/i }),
  ).toBeVisible();
  await expect(page.getByText("FIT beside range, never merged.")).toBeVisible();
  await expect(page.getByText("Profile overlap, not admission odds.")).toBeVisible();
  await expect(page.getByText(/campus culture, social fit, teaching quality/i)).toBeVisible();
  await expect(page.getByText(/Merit aid is not predicted/i)).toBeVisible();
  await expect(page.getByText("Calibration: not yet published.")).toBeVisible();
  await expect(page.getByText(/not yet validated against real, consented/)).toBeVisible();
  await expect(page.getByText("fixture_contract_check")).toBeVisible();
  await expect(page.getByText("Calibration by predicted range")).toHaveCount(0);
  await expect(page.getByText("Calibration by selectivity tier")).toHaveCount(0);
  await expect(page.getByText("Real-data span compared with the Phase 2 prior")).toHaveCount(0);
  await expect(page.getByText("Change-course check")).toHaveCount(0);
});
