export type LocalSchoolFixture = {
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

export const localSchoolFixtures: LocalSchoolFixture[] = [
  {
    unitid: 166683,
    name: "Massachusetts Institute of Technology",
    state: "MA",
    province_state: "MA",
    country: "US",
    selectivity_tier: "elite",
    sat_25: 1520,
    sat_75: 1580,
    act_25: 34,
    act_75: 36,
    test_policy: "required",
  },
  {
    unitid: 170976,
    name: "University of Michigan-Ann Arbor",
    state: "MI",
    province_state: "MI",
    country: "US",
    selectivity_tier: "highly_selective",
    sat_25: 1360,
    sat_75: 1530,
    act_25: 31,
    act_75: 34,
    test_policy: "optional",
  },
  {
    unitid: 100751,
    name: "The University of Alabama",
    state: "AL",
    province_state: "AL",
    country: "US",
    selectivity_tier: "accessible",
    sat_25: 1170,
    sat_75: 1400,
    act_25: 24,
    act_75: 31,
    test_policy: "optional",
  },
];

export function searchLocalSchoolFixtures(query: string, limit = 8) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length < 2) {
    return [];
  }

  return localSchoolFixtures
    .filter((school) =>
      [school.name, school.state, school.selectivity_tier]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery)),
    )
    .slice(0, limit);
}
