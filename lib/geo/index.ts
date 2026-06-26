export type Country = "US" | "CA";
export type GradingBasis = "gpa_4_0" | "percentage" | "cegep_r_score";

type NormalizeGradingOptions = {
  country?: Country | string | null;
  provinceState?: string | null;
  admissionSystem?: string | null;
};

const CA_PROVINCES = new Map([
  ["AB", "AB"],
  ["ALBERTA", "AB"],
  ["BC", "BC"],
  ["BRITISHCOLUMBIA", "BC"],
  ["MB", "MB"],
  ["MANITOBA", "MB"],
  ["NB", "NB"],
  ["NEWBRUNSWICK", "NB"],
  ["NL", "NL"],
  ["NEWFOUNDLANDANDLABRADOR", "NL"],
  ["NS", "NS"],
  ["NOVASCOTIA", "NS"],
  ["NT", "NT"],
  ["NORTHWESTTERRITORIES", "NT"],
  ["NU", "NU"],
  ["NUNAVUT", "NU"],
  ["ON", "ON"],
  ["ONTARIO", "ON"],
  ["PE", "PE"],
  ["PEI", "PE"],
  ["PRINCEEDWARDISLAND", "PE"],
  ["QC", "QC"],
  ["QUBEC", "QC"],
  ["QUEBEC", "QC"],
  ["SK", "SK"],
  ["SASKATCHEWAN", "SK"],
  ["YT", "YT"],
  ["YUKON", "YT"],
]);

const US_STATES = new Map([
  ["AL", "AL"],
  ["ALABAMA", "AL"],
  ["AK", "AK"],
  ["ALASKA", "AK"],
  ["AZ", "AZ"],
  ["ARIZONA", "AZ"],
  ["AR", "AR"],
  ["ARKANSAS", "AR"],
  ["CA", "CA"],
  ["CALIFORNIA", "CA"],
  ["CO", "CO"],
  ["COLORADO", "CO"],
  ["CT", "CT"],
  ["CONNECTICUT", "CT"],
  ["DC", "DC"],
  ["DE", "DE"],
  ["DELAWARE", "DE"],
  ["FL", "FL"],
  ["FLORIDA", "FL"],
  ["GA", "GA"],
  ["GEORGIA", "GA"],
  ["HI", "HI"],
  ["HAWAII", "HI"],
  ["IA", "IA"],
  ["IOWA", "IA"],
  ["ID", "ID"],
  ["IDAHO", "ID"],
  ["IL", "IL"],
  ["ILLINOIS", "IL"],
  ["IN", "IN"],
  ["INDIANA", "IN"],
  ["KS", "KS"],
  ["KANSAS", "KS"],
  ["KY", "KY"],
  ["KENTUCKY", "KY"],
  ["LA", "LA"],
  ["LOUISIANA", "LA"],
  ["MA", "MA"],
  ["MASSACHUSETTS", "MA"],
  ["MD", "MD"],
  ["MARYLAND", "MD"],
  ["ME", "ME"],
  ["MAINE", "ME"],
  ["MI", "MI"],
  ["MICHIGAN", "MI"],
  ["MN", "MN"],
  ["MINNESOTA", "MN"],
  ["MO", "MO"],
  ["MISSOURI", "MO"],
  ["MS", "MS"],
  ["MISSISSIPPI", "MS"],
  ["MT", "MT"],
  ["MONTANA", "MT"],
  ["NC", "NC"],
  ["NORTHCAROLINA", "NC"],
  ["ND", "ND"],
  ["NORTHDAKOTA", "ND"],
  ["NE", "NE"],
  ["NEBRASKA", "NE"],
  ["NH", "NH"],
  ["NEWHAMPSHIRE", "NH"],
  ["NJ", "NJ"],
  ["NEWJERSEY", "NJ"],
  ["NM", "NM"],
  ["NEWMEXICO", "NM"],
  ["NV", "NV"],
  ["NEVADA", "NV"],
  ["NY", "NY"],
  ["NEWYORK", "NY"],
  ["OH", "OH"],
  ["OHIO", "OH"],
  ["OK", "OK"],
  ["OKLAHOMA", "OK"],
  ["OR", "OR"],
  ["OREGON", "OR"],
  ["PA", "PA"],
  ["PENNSYLVANIA", "PA"],
  ["RI", "RI"],
  ["RHODEISLAND", "RI"],
  ["SC", "SC"],
  ["SOUTHCAROLINA", "SC"],
  ["SD", "SD"],
  ["SOUTHDAKOTA", "SD"],
  ["TN", "TN"],
  ["TENNESSEE", "TN"],
  ["TX", "TX"],
  ["TEXAS", "TX"],
  ["UT", "UT"],
  ["UTAH", "UT"],
  ["VA", "VA"],
  ["VIRGINIA", "VA"],
  ["VT", "VT"],
  ["VERMONT", "VT"],
  ["WA", "WA"],
  ["WASHINGTON", "WA"],
  ["WI", "WI"],
  ["WISCONSIN", "WI"],
  ["WV", "WV"],
  ["WESTVIRGINIA", "WV"],
  ["WY", "WY"],
  ["WYOMING", "WY"],
]);

const CEGEP_R_SCORE_MIN = 15;
const CEGEP_R_SCORE_MAX = 40;

function token(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

export function normalizeCountry(value: unknown): Country {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("country is required");
  }

  switch (token(value)) {
    case "US":
    case "USA":
    case "UNITEDSTATES":
    case "UNITEDSTATESOFAMERICA":
      return "US";
    case "CA":
    case "CAN":
    case "CANADA":
      return "CA";
  }

  throw new Error(`unsupported country: ${value}`);
}

export function normalizeGradingBasis(
  value?: unknown,
  options: NormalizeGradingOptions = {},
): GradingBasis {
  if (typeof value === "string" && value.trim() !== "") {
    switch (token(value)) {
      case "GPA":
      case "GPA40":
      case "GPA4":
      case "GPA40SCALE":
        return "gpa_4_0";
      case "PERCENT":
      case "PERCENTAGE":
      case "TOP6":
      case "ONTARIOPERCENTAGE":
        return "percentage";
      case "CEGEPRSCORE":
      case "RSCORE":
      case "CRC":
      case "COTEDERENDEMENTAUCOLLEGIAL":
        return "cegep_r_score";
    }

    throw new Error(`unsupported grading basis: ${value}`);
  }

  if (!options.country) {
    throw new Error("country is required when grading basis is omitted");
  }

  const country = normalizeCountry(options.country);
  switch (country) {
    case "US":
      return "gpa_4_0";
    case "CA": {
      const province = options.provinceState
        ? provinceOrState({
            country,
            province_state: options.provinceState,
          })
        : null;
      return province === "QC" && options.admissionSystem === "quebec_cegep"
        ? "cegep_r_score"
        : "percentage";
    }
  }
}

export function provinceOrState(input: {
  country: Country | string;
  state?: string | null;
  province_state?: string | null;
}) {
  const country = normalizeCountry(input.country);
  const raw = input.province_state ?? input.state;
  if (!raw || raw.trim() === "") {
    return null;
  }

  switch (country) {
    case "US":
      return US_STATES.get(token(raw)) ?? raw.trim().toUpperCase();
    case "CA":
      return CA_PROVINCES.get(token(raw)) ?? raw.trim().toUpperCase();
  }
}

export function toComparisonSpace(value: number, basis: GradingBasis) {
  assertFinite(value, "value");

  switch (basis) {
    case "gpa_4_0":
      return (value / 4) * 100;
    case "percentage":
      return value;
    case "cegep_r_score":
      return (
        ((value - CEGEP_R_SCORE_MIN) /
          (CEGEP_R_SCORE_MAX - CEGEP_R_SCORE_MIN)) *
        100
      );
  }
}

export function fromComparisonSpace(value: number, basis: GradingBasis) {
  assertFinite(value, "value");

  switch (basis) {
    case "gpa_4_0":
      return (value / 100) * 4;
    case "percentage":
      return value;
    case "cegep_r_score":
      return (
        CEGEP_R_SCORE_MIN +
        (value / 100) * (CEGEP_R_SCORE_MAX - CEGEP_R_SCORE_MIN)
      );
  }
}
