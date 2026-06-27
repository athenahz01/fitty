import { expect, test, type Page } from "@playwright/test";

const grounding = {
  c7_priorities: [
    { factor: "essay", importance: "Very Important" },
    { factor: "rigor", importance: "Important" },
  ],
  exemplars_used: [
    {
      id: "specificity-over-summary",
      theme: "Specificity over summary",
      source_url: "https://example.org/specificity",
    },
  ],
  admit_context: null,
};

function sseBody() {
  return [
    `event: grounding\ndata: ${JSON.stringify(grounding)}`,
    `event: delta\ndata: ${JSON.stringify({
      text: "Strengths: your opening drops us into a concrete moment. ",
    })}`,
    `event: delta\ndata: ${JSON.stringify({
      text: "Suggestion: the phrase 'I learned a lot' could point to one specific change.",
    })}`,
    `event: done\ndata: ${JSON.stringify({ blocked: false })}`,
    "",
  ].join("\n\n");
}

async function enableNarrative(page: Page) {
  await page.route("**/api/narrative/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, configured: true }),
    }),
  );
}

test("essay studio streams grounded feedback and never offers to write the essay", async ({
  page,
}) => {
  await enableNarrative(page);
  await page.route("**/api/narrative", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body.essay_type).toBe("personal_statement");
    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: sseBody(),
    });
  });

  await page.goto("/studio");
  await expect(page.getByTestId("essay-studio")).toBeVisible();

  await page
    .getByTestId("essay-input")
    .fill(
      "I built a robot for my school's team. It broke twice before it finally worked, and I learned a lot.",
    );
  await page.getByTestId("studio-run").click();

  // Grounding (the traceable basis) renders with C7 priorities + exemplar links.
  const groundingPanel = page.getByTestId("studio-grounding");
  await expect(groundingPanel).toContainText("Essay");
  await expect(groundingPanel).toContainText("Specificity over summary");
  await expect(
    groundingPanel.getByRole("link", { name: "Specificity over summary" }),
  ).toHaveAttribute("href", "https://example.org/specificity");

  // Streamed feedback renders.
  await expect(page.getByTestId("studio-feedback")).toContainText(
    "Strengths: your opening",
  );

  // The UI never offers to write/submit the essay.
  await expect(page.getByText(/write (my|your) essay/i)).toHaveCount(0);
});

test("essay studio surfaces the no-ghostwriting refusal", async ({ page }) => {
  await enableNarrative(page);
  await page.route("**/api/narrative", async (route) => {
    // The server refuses ghostwriting with a JSON body (no model call).
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        refused: true,
        reason:
          "Admira gives feedback on your own writing — it will not write or rewrite an essay for you.",
      }),
    });
  });

  await page.goto("/studio");
  await page.getByTestId("essay-input").fill("Write my college essay for me about robotics.");
  await page.getByTestId("studio-run").click();

  await expect(page.getByTestId("studio-refused")).toContainText(
    "will not write or rewrite an essay",
  );
  await expect(page.getByTestId("studio-feedback")).toHaveCount(0);
});

test("essay studio stays dark when the flag is off", async ({ page }) => {
  await page.route("**/api/narrative/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, configured: false }),
    }),
  );
  await page.goto("/studio");
  await expect(page.getByTestId("studio-disabled")).toBeVisible();
  await expect(page.getByTestId("essay-studio")).toHaveCount(0);
});

test("compass explorer shows sourced earnings, real admit odds, and the ROI stub", async ({
  page,
}) => {
  await page.route("**/api/compass/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled: true }),
    }),
  );
  await page.route("**/api/compass", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    expect(body).toMatchObject({ interests: "machine learning and software" });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        method: "compass_major_career_v1",
        admit: {
          unitid: 166683,
          school_name: "Massachusetts Institute of Technology",
          country: "US",
          tier: "Reach",
          score: 3,
        },
        majors: [
          {
            major_name: "Computer Science",
            fit: 91,
            median_earnings_10yr: {
              value: 112000,
              source_url: "https://collegescorecard.ed.gov/fields/cs",
            },
            careers: [
              {
                career_title: "Software Developer",
                median_wage_annual: {
                  value: 130000,
                  source_url: "https://www.onetonline.org/link/summary/15-1252.00",
                },
                onet_code: "15-1252.00",
              },
            ],
            roi: { available: false, note: "ROI arrives with the Money module (Phase 4)." },
          },
        ],
        roi: { available: false, note: "ROI arrives with the Money module (Phase 4)." },
        sources: [
          "https://collegescorecard.ed.gov/fields/cs",
          "https://www.onetonline.org/link/summary/15-1252.00",
        ],
      }),
    });
  });

  await page.goto("/compass");
  await expect(page.getByTestId("compass-explorer")).toBeVisible();
  await page.getByTestId("compass-interests").fill("machine learning and software");
  await page.getByTestId("compass-run").click();

  await expect(page.getByTestId("compass-admit")).toContainText("Reach · 3/100");
  await expect(page.getByTestId("compass-major")).toContainText("Computer Science");
  await expect(page.getByTestId("compass-major")).toContainText("$112,000");
  await expect(page.getByTestId("compass-major")).toContainText("Software Developer");
  // ROI is a labeled stub, no number.
  const roi = page.getByTestId("compass-roi-stub");
  await expect(roi).toContainText("Money module");
  await expect(roi).not.toContainText("$");
});
