export type SchoolSearchResult = {
  unitid: number;
  name: string;
  state: string | null;
  province_state: string | null;
  country: "US" | "CA";
  selectivity_tier: string | null;
  sat_25: number | null;
  sat_75: number | null;
  act_25: number | null;
  act_75: number | null;
  test_policy: string | null;
};

type SchoolSearchPayload = {
  results?: SchoolSearchResult[];
  error?: string;
};

export async function searchSchools(query: string) {
  const response = await fetch(
    `/api/schools/search?q=${encodeURIComponent(query)}`,
  );
  const payload = (await response.json()) as SchoolSearchPayload;

  if (!response.ok) {
    throw new Error(payload.error ?? "School search is unavailable.");
  }

  return payload.results ?? [];
}
