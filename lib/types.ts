export type TestPolicy = "required" | "optional" | "blind" | "unknown";

export type SelectivityTier =
  | "elite"
  | "highly_selective"
  | "selective"
  | "accessible";

export type SchoolSizeBand = "small" | "medium" | "large";

export type SchoolRegion = "Northeast" | "Midwest" | "South" | "West";

export type C7Rating =
  | "Very Important"
  | "Important"
  | "Considered"
  | "Not Considered";

export type C7FactorKey =
  | "rigor"
  | "gpa"
  | "test_scores"
  | "essay"
  | "recommendations"
  | "extracurriculars"
  | "talent"
  | "first_generation"
  | "state_residency"
  | "demonstrated_interest";

export type C7Factors = Partial<Record<C7FactorKey, C7Rating>> & {
  _source?: string;
};

export type School = {
  unitid: number;
  name: string;
  state: string | null;
  setting: "city" | "suburb" | "town" | "rural" | null;
  size: number | null;
  admit_rate: number | null;
  sat_25: number | null;
  sat_75: number | null;
  act_25: number | null;
  act_75: number | null;
  gpa_avg: number | null;
  test_policy: TestPolicy;
  ed_admit_rate: number | null;
  rd_admit_rate: number | null;
  c7_factors: C7Factors | null;
  selectivity_tier: SelectivityTier | null;
  program_areas: string[] | null;
  size_band: SchoolSizeBand | null;
  region: SchoolRegion | null;
  net_price_avg: number | null;
  sticker_cost: number | null;
  median_earnings_10yr: number | null;
  completion_rate: number | null;
  embedding: number[] | null;
  updated_at: string;
};

export type ConsentRecord = {
  id: string;
  subject_id: string;
  consent_version: string;
  consent_text: string;
  purpose: "real_outcome_modeling";
  consented_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type ApplicantProfile = {
  id: string;
  subject_id: string;
  consent_record_id: string;
  cycle_year: number;
  gpa: number | null;
  course_rigor: "standard" | "honors" | "ap_ib_dual" | "most_rigorous" | "unknown" | null;
  sat_score: number | null;
  act_score: number | null;
  test_submitted: boolean;
  activities_tier: "none" | "school" | "regional" | "state" | "national" | "unknown" | null;
  intended_major: string | null;
  application_round: "regular" | "early";
  demonstrated_interest: "none" | "light" | "moderate" | "strong" | "unknown" | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationOutcome = {
  id: string;
  subject_id: string;
  profile_id: string;
  consent_record_id: string;
  unitid: number;
  outcome: "admitted" | "denied" | "waitlisted" | "deferred";
  application_round: "regular" | "early";
  cycle_year: number;
  created_at: string;
};

export type DataAccessLog = {
  id: string;
  subject_id: string;
  actor: string;
  action:
    | "consent_recorded"
    | "profile_created"
    | "outcome_created"
    | "exported"
    | "deleted"
    | "consent_revoked";
  row_count: number;
  reason: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      schools: {
        Row: School;
        Insert: Omit<
          School,
          | "updated_at"
          | "program_areas"
          | "size_band"
          | "region"
          | "net_price_avg"
          | "sticker_cost"
          | "median_earnings_10yr"
          | "completion_rate"
          | "embedding"
        > & {
          updated_at?: string;
        } & Partial<
            Pick<
              School,
              | "program_areas"
              | "size_band"
              | "region"
              | "net_price_avg"
              | "sticker_cost"
              | "median_earnings_10yr"
              | "completion_rate"
              | "embedding"
            >
          >;
        Update: Partial<Omit<School, "unitid">>;
        Relationships: [];
      };
      consent_records: {
        Row: ConsentRecord;
        Insert: Omit<ConsentRecord, "created_at" | "id" | "consented_at"> & {
          id?: string;
          consented_at?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ConsentRecord, "id" | "subject_id" | "created_at">>;
        Relationships: [];
      };
      applicant_profiles: {
        Row: ApplicantProfile;
        Insert: Omit<ApplicantProfile, "created_at" | "id" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ApplicantProfile, "id" | "subject_id" | "created_at">>;
        Relationships: [];
      };
      application_outcomes: {
        Row: ApplicationOutcome;
        Insert: Omit<ApplicationOutcome, "created_at" | "id"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ApplicationOutcome, "id" | "subject_id" | "created_at">>;
        Relationships: [];
      };
      data_access_logs: {
        Row: DataAccessLog;
        Insert: Omit<DataAccessLog, "actor" | "created_at" | "id"> & {
          actor?: string;
          created_at?: string;
          id?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
