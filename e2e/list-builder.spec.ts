import { expect, test, type Page } from "@playwright/test";

function listResponse(shape: { reach: number; target: number; safety: number }) {
  return {
    list: [
      {
        unitid: 101,
        name: "Reach Elite",
        tier: "Reach",
        bucket: "reach",
        fit: 96,
        net_cost: 25000,
        affordable: true,
        rationale: "Strong program fit (96), reach odds, under your $30,000 budget.",
      },
      {
        unitid: 201,
        name: "Target State",
        tier: "Target",
        bucket: "target",
        fit: 88,
        net_cost: 18000,
        affordable: true,
        rationale: "Strong program fit (88), target odds, under your $30,000 budget.",
      },
      {
        unitid: 301,
        name: "Safety Local",
        tier: "Safety",
        bucket: "safety",
        fit: 74,
        net_cost: 14000,
        affordable: true,
        rationale: "Strong program fit (74), safety odds, under your $30,000 budget.",
      },
    ],
    overlooking: [
      {
        unitid: 401,
        name: "Overlooked Gem",
        tier: "Target",
        bucket: "target",
        fit: 81,
        net_cost: 12000,
        affordable: true,
        rationale: "Strong program fit (81), target odds, under your $30,000 budget.",
      },
    ],
    objective: {
      weights: { fit: 0.7, cost: 0.3 },
      shape,
      description:
        "Order = W_FIT * (fit/100) + W_COST * affordability, tie-broken by unitid.",
      method: "list_builder_objective_v1",
    },
    balance: {
      reach: 1,
      target: 1,
      safety: 1,
      note: "Balanced across reach, target, and safety by the Phase 1 admit tier.",
    },
    excluded: { canada: 0 },
  };
}

const universeResponse = {
  method: "school_universe_v1",
  school: {
    unitid: 166683,
    name: "Massachusetts Institute of Technology",
    country: "US",
    location: "MA",
    setting: "city",
    size: 4500,
    selectivity_tier: "elite",
    test_policy: "required",
    program_areas: ["Engineering", "Computer and information sciences"],
    programs: ["Computer Science"],
  },
  headline: {
    tier: "elite",
    admit_rate: { value: 0.045, source: "IPEDS / College Scorecard admit rate" },
  },
  admissions: {
    sat: {
      low: { value: 1520, source: "College Scorecard / CDS middle-50 test bands" },
      high: { value: 1580, source: "College Scorecard / CDS middle-50 test bands" },
    },
    act: {
      low: { value: 34, source: "College Scorecard / CDS middle-50 test bands" },
      high: { value: 36, source: "College Scorecard / CDS middle-50 test bands" },
    },
    gpa_avg: { value: null, source: "College Scorecard / CDS average GPA" },
  },
  cost: {
    net_price_avg: { value: 22000, source: "College Scorecard average net price" },
    sticker_cost: { value: 82000, source: "College Scorecard published cost of attendance" },
  },
  outcomes: {
    median_earnings_10yr: { value: 124000, source: "College Scorecard median earnings 10yr" },
    completion_rate: { value: 0.95, source: "College Scorecard completion rate" },
  },
  programs: [
    {
      program_name: "Computer Science",
      cutoff_avg_low: null,
      cutoff_avg_high: null,
      cutoff_basis: null,
      prerequisites: [],
      supplemental_app: false,
      broad_based_admission: false,
      source_url: "https://example.org/mit-cs",
    },
  ],
  similar: [
    {
      unitid: 999,
      name: "Peer Institute",
      similarity: 0.8,
      program_areas: ["Engineering"],
    },
  ],
  notes: ["No published average GPA is loaded for this school."],
  lineage: {},
};

async function mockStatuses(page: Page) {
  await page.route("**/api/outcomes/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );
  await page.route("**/api/fit/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );
  await page.route("**/api/admit-intelligence/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );
  await page.route("**/api/list/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: true }) }),
  );
}

test("generates a balanced list and re-balances live when a slider moves", async ({
  page,
}) => {
  const requestBodies: Array<Record<string, unknown>> = [];

  await mockStatuses(page);
  await page.route("**/api/list/generate", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    requestBodies.push(body);
    const shape =
      (body.preferences as { shape?: { reach: number; target: number; safety: number } })
        ?.shape ?? { reach: 3, target: 4, safety: 3 };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(listResponse(shape)),
    });
  });

  await page.goto("/");

  const panel = page.getByTestId("list-builder-panel");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Intended major").fill("Computer Science");
  await panel.getByLabel("Net price budget").fill("30000");
  await panel.getByTestId("list-builder-generate").click();

  await expect(panel.getByTestId("list-builder-results")).toBeVisible();
  await expect(panel.getByTestId("list-school")).toHaveCount(4); // 3 list + 1 overlooking
  await expect(panel.getByTestId("list-balance")).toContainText(
    "1 reach · 1 target · 1 safety",
  );
  await expect(panel.getByTestId("list-overlooking")).toContainText(
    "Overlooked Gem",
  );
  await expect(panel).toContainText("reach odds");
  expect(requestBodies).toHaveLength(1);

  // Live re-balance: drag the Reach slider and confirm a second request fires
  // with the new shape.
  const reachSlider = panel.getByLabel("Reach count");
  await reachSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => requestBodies.length).toBeGreaterThan(1);
  const lastBody = requestBodies[requestBodies.length - 1];
  const lastShape = (lastBody.preferences as { shape: { reach: number } }).shape;
  expect(lastShape.reach).toBe(4);
});

test("keeps the List Builder dark when the server flag is disabled", async ({
  page,
}) => {
  await page.route("**/api/outcomes/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );
  await page.route("**/api/fit/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );
  await page.route("**/api/admit-intelligence/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );
  await page.route("**/api/list/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );

  await page.goto("/");
  await expect(page.getByTestId("list-builder-panel")).toHaveCount(0);
});

test("renders a program/school universe page with sourced figures", async ({
  page,
}) => {
  await mockStatuses(page);
  await page.route("**/api/schools/universe", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body).toMatchObject({ unitid: 166683 });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(universeResponse),
    });
  });

  await page.goto("/schools/166683");

  const universe = page.getByTestId("school-universe");
  await expect(universe).toBeVisible();
  await expect(universe).toContainText("Massachusetts Institute of Technology");
  await expect(page.getByTestId("universe-admit-rate")).toContainText("5%");
  await expect(page.getByTestId("universe-programs")).toContainText(
    "Computer Science",
  );
  await expect(page.getByTestId("universe-similar")).toContainText(
    "Peer Institute",
  );
  await expect(universe).toContainText("College Scorecard average net price");
});
