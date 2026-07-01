export type TestPolicy = "required" | "optional" | "blind" | "unknown";

export type Country = "US" | "CA";

export type AdmissionSystem =
  | "common_app"
  | "coalition"
  | "ouac"
  | "direct"
  | "quebec_cegep";

export type GradingBasis = "gpa_4_0" | "percentage" | "cegep_r_score";

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
  country: Country;
  province_state: string | null;
  admission_system: AdmissionSystem | null;
  grading_basis: GradingBasis;
  broad_based_admission: boolean;
  merit_auto: Record<string, unknown> | null;
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
  programs: string[] | null;
  control: "public" | "private" | null;
  size_band: SchoolSizeBand | null;
  region: SchoolRegion | null;
  net_price_avg: number | null;
  sticker_cost: number | null;
  median_earnings_10yr: number | null;
  completion_rate: number | null;
  embedding: number[] | null;
  updated_at: string;
};

export type ProgramRequirement = {
  id: string;
  unitid: number;
  program_name: string;
  system: AdmissionSystem | null;
  cutoff_avg_low: number | null;
  cutoff_avg_high: number | null;
  cutoff_basis: GradingBasis | null;
  prerequisites: unknown[] | Record<string, unknown> | null;
  test_policy: TestPolicy | null;
  supplemental_app: boolean;
  broad_based_admission: boolean;
  source_url: string;
  ingested_at: string;
};

export type ApplicationDeadline = {
  id: string;
  unitid: number;
  program_requirement_id: string | null;
  admission_system: AdmissionSystem | null;
  deadline_kind: "regular" | "early" | "priority" | "document" | "system";
  label: string;
  deadline_date: string;
  source_url: string;
  source_name: string | null;
  created_at: string;
};

export type CommandCenterTaskRow = {
  id: string;
  subject_id: string;
  unitid: number;
  program_requirement_id: string | null;
  requirement_key: string;
  title: string;
  detail: string | null;
  category: "academic" | "testing" | "form" | "review" | "deadline" | "document";
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type RequirementStatusRow = {
  id: string;
  subject_id: string;
  unitid: number;
  program_requirement_id: string | null;
  requirement_key: string;
  status: "todo" | "in_progress" | "done";
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  subject_id: string;
  unitid: number | null;
  task_id: string | null;
  requirement_status_id: string | null;
  requirement_key: string | null;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: "uploaded" | "deleted";
  created_at: string;
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
  profile_embedding: number[] | null;
  profile_embedding_model: string | null;
  provenance: "consented_user" | "curated_public";
  source_url: string | null;
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
  provenance: "consented_user" | "curated_public";
  source_url: string | null;
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

export type CompassMajorRow = {
  id: string;
  major_name: string;
  scorecard_field: string | null;
  median_earnings_10yr: number | null;
  source_url: string;
  provenance: string;
  ingested_at: string;
};

export type CompassCareerRow = {
  id: string;
  major_name: string;
  career_title: string;
  onet_code: string | null;
  median_wage_annual: number | null;
  source_url: string;
  provenance: string;
  ingested_at: string;
};

export type MoneyMeritRuleRow = {
  id: string;
  rule_id: string;
  unitid: number;
  school_name: string;
  country: Country;
  scholarship_name: string;
  residency: "any" | "in_state" | "out_of_state" | "domestic" | "international";
  currency: "USD" | "CAD";
  amount_basis: "verified" | "estimate";
  annual_amount: number;
  total_value: number | null;
  renewable_years: number | null;
  gpa_min: number | null;
  gpa_max: number | null;
  sat_min: number | null;
  sat_max: number | null;
  act_min: number | null;
  act_max: number | null;
  percentage_min: number | null;
  percentage_max: number | null;
  priority: number;
  source_url: string;
  provenance: "curated_public";
  notes: string | null;
  ingested_at: string;
};

export type MoneyNetPriceBandRow = {
  id: string;
  unitid: number;
  school_name: string;
  country: Country;
  residency: "any" | "in_state" | "out_of_state" | "domestic" | "international";
  income_band:
    | "0-30000"
    | "30001-48000"
    | "48001-75000"
    | "75001-110000"
    | "110001-plus"
    | "overall";
  currency: "USD" | "CAD";
  sticker_price: number;
  net_price: number;
  median_earnings_10yr: number | null;
  basis: "verified" | "estimate";
  earnings_basis: "verified" | "estimate" | null;
  source_url: string;
  earnings_source_url: string | null;
  source_year: string | null;
  provenance: "college_scorecard_api" | "curated_public";
  notes: string | null;
  ingested_at: string;
};

export type ReportShareRow = {
  id: string;
  subject_id: string;
  token_hash: string;
  report_payload: Record<string, unknown>;
  revoked_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      compass_majors: {
        Row: CompassMajorRow;
        Insert: Omit<CompassMajorRow, "id" | "ingested_at"> & {
          id?: string;
          ingested_at?: string;
        };
        Update: Partial<Omit<CompassMajorRow, "id">>;
        Relationships: [];
      };
      compass_careers: {
        Row: CompassCareerRow;
        Insert: Omit<CompassCareerRow, "id" | "ingested_at"> & {
          id?: string;
          ingested_at?: string;
        };
        Update: Partial<Omit<CompassCareerRow, "id">>;
        Relationships: [];
      };
      money_merit_rules: {
        Row: MoneyMeritRuleRow;
        Insert: Omit<MoneyMeritRuleRow, "id" | "ingested_at"> & {
          id?: string;
          ingested_at?: string;
        };
        Update: Partial<Omit<MoneyMeritRuleRow, "id">>;
        Relationships: [];
      };
      money_net_price_bands: {
        Row: MoneyNetPriceBandRow;
        Insert: Omit<MoneyNetPriceBandRow, "id" | "ingested_at"> & {
          id?: string;
          ingested_at?: string;
        };
        Update: Partial<Omit<MoneyNetPriceBandRow, "id">>;
        Relationships: [];
      };
      report_shares: {
        Row: ReportShareRow;
        Insert: Omit<ReportShareRow, "id" | "created_at" | "revoked_at"> & {
          id?: string;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: Partial<Omit<ReportShareRow, "id" | "subject_id" | "created_at">>;
        Relationships: [];
      };
      schools: {
        Row: School;
        Insert: Omit<
          School,
          | "updated_at"
          | "program_areas"
          | "programs"
          | "control"
          | "country"
          | "province_state"
          | "admission_system"
          | "grading_basis"
          | "broad_based_admission"
          | "merit_auto"
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
              | "programs"
              | "control"
              | "country"
              | "province_state"
              | "admission_system"
              | "grading_basis"
              | "broad_based_admission"
              | "merit_auto"
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
      program_requirements: {
        Row: ProgramRequirement;
        Insert: Omit<ProgramRequirement, "id" | "ingested_at"> & {
          id?: string;
          ingested_at?: string;
        };
        Update: Partial<Omit<ProgramRequirement, "id">>;
        Relationships: [
          {
            foreignKeyName: "program_requirements_unitid_fkey";
            columns: ["unitid"];
            referencedRelation: "schools";
            referencedColumns: ["unitid"];
          },
        ];
      };
      application_deadlines: {
        Row: ApplicationDeadline;
        Insert: Omit<ApplicationDeadline, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ApplicationDeadline, "id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "application_deadlines_unitid_fkey";
            columns: ["unitid"];
            referencedRelation: "schools";
            referencedColumns: ["unitid"];
          },
          {
            foreignKeyName: "application_deadlines_program_requirement_id_fkey";
            columns: ["program_requirement_id"];
            referencedRelation: "program_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: CommandCenterTaskRow;
        Insert: Omit<CommandCenterTaskRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<CommandCenterTaskRow, "id" | "subject_id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "tasks_unitid_fkey";
            columns: ["unitid"];
            referencedRelation: "schools";
            referencedColumns: ["unitid"];
          },
          {
            foreignKeyName: "tasks_program_requirement_id_fkey";
            columns: ["program_requirement_id"];
            referencedRelation: "program_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      requirement_status: {
        Row: RequirementStatusRow;
        Insert: Omit<RequirementStatusRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<RequirementStatusRow, "id" | "subject_id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "requirement_status_unitid_fkey";
            columns: ["unitid"];
            referencedRelation: "schools";
            referencedColumns: ["unitid"];
          },
          {
            foreignKeyName: "requirement_status_program_requirement_id_fkey";
            columns: ["program_requirement_id"];
            referencedRelation: "program_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: DocumentRow;
        Insert: Omit<
          DocumentRow,
          | "id"
          | "created_at"
          | "status"
          | "task_id"
          | "requirement_status_id"
        > & {
          id?: string;
          created_at?: string;
          status?: DocumentRow["status"];
          task_id?: string | null;
          requirement_status_id?: string | null;
        };
        Update: Partial<Omit<DocumentRow, "id" | "subject_id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "documents_unitid_fkey";
            columns: ["unitid"];
            referencedRelation: "schools";
            referencedColumns: ["unitid"];
          },
          {
            foreignKeyName: "documents_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_requirement_status_id_fkey";
            columns: ["requirement_status_id"];
            referencedRelation: "requirement_status";
            referencedColumns: ["id"];
          },
        ];
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
        Insert: Omit<
          ApplicantProfile,
          | "created_at"
          | "id"
          | "updated_at"
          | "profile_embedding"
          | "profile_embedding_model"
          | "provenance"
          | "source_url"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          profile_embedding?: number[] | string | null;
          profile_embedding_model?: string | null;
          provenance?: ApplicantProfile["provenance"];
          source_url?: string | null;
        };
        Update: Partial<Omit<ApplicantProfile, "id" | "subject_id" | "created_at">>;
        Relationships: [];
      };
      application_outcomes: {
        Row: ApplicationOutcome;
        Insert: Omit<
          ApplicationOutcome,
          "created_at" | "id" | "provenance" | "source_url"
        > & {
          id?: string;
          created_at?: string;
          provenance?: ApplicationOutcome["provenance"];
          source_url?: string | null;
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
    Functions: {
      match_fit_schools: {
        Args: {
          p_query_embedding: string;
          p_match_count?: number;
          p_preferred_region?: SchoolRegion | null;
          p_preferred_size?: SchoolSizeBand | null;
          p_preferred_setting?: School["setting"];
          p_cost_ceiling?: number | null;
          p_include_canada?: boolean;
        };
        Returns: Array<
          Pick<
            School,
            | "unitid"
            | "name"
            | "state"
            | "province_state"
            | "country"
            | "admission_system"
            | "grading_basis"
            | "broad_based_admission"
            | "setting"
            | "size"
            | "admit_rate"
            | "sat_25"
            | "sat_75"
            | "act_25"
            | "act_75"
            | "gpa_avg"
            | "test_policy"
            | "c7_factors"
            | "selectivity_tier"
            | "program_areas"
            | "programs"
            | "control"
            | "size_band"
            | "region"
            | "net_price_avg"
            | "sticker_cost"
            | "median_earnings_10yr"
            | "completion_rate"
          > & {
            similarity: number;
          }
        >;
      };
      match_similar_cohort: {
        Args: {
          p_profile_embedding: string;
          p_unitid?: number | null;
          p_exclude_subject_id?: string | null;
          p_exclude_cycle_year?: number | null;
          p_k?: number;
          p_match_count?: number;
        };
        Returns: Array<{
          unitid: number;
          school_name: string;
          cohort_size: number;
          admitted_count: number;
          denied_count: number;
          waitlisted_count: number;
          deferred_count: number;
          admit_rate: number;
          denied_rate: number;
          waitlisted_rate: number;
          deferred_rate: number;
          similarity_min: number | null;
          similarity_max: number | null;
          attribute_cards: unknown;
          admit_insights: unknown;
          provenance: unknown;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
