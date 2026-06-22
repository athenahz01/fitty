// Pure builder for the student fit-query document that gets embedded and
// matched against school documents. Kept free of server-only imports so both
// the API (lib/fit/embed-query.ts) and the offline eval (pipeline/eval_fit.ts)
// build the query the same way. Vocabulary mirrors the school document builder
// (pipeline/fit_school_documents.py) so the query and school embedding spaces
// line up.
import type { FitRequest } from "./schema";

function normalizedText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function normalizedLabel(value: string | undefined) {
  return normalizedText(value)?.replace(/_/g, " ").toLowerCase();
}

export function buildFitQueryDocument(input: FitRequest) {
  const sentences = ["Student fit query."];
  const descriptorParts = [];
  const size = normalizedLabel(input.preferred_size);
  const setting = normalizedLabel(input.preferred_setting);

  if (size) {
    descriptorParts.push(size);
  }
  if (setting) {
    descriptorParts.push(setting);
  }

  const region = normalizedText(input.preferred_region);
  const descriptor = descriptorParts.join(" ");
  if (descriptor && region) {
    sentences.push(`Prefers a ${descriptor} school in the ${region}.`);
  } else if (descriptor) {
    sentences.push(`Prefers a ${descriptor} school.`);
  } else if (region) {
    sentences.push(`Prefers a school in the ${region}.`);
  }

  const programParts = [
    normalizedText(input.intended_major),
    normalizedText(input.interests),
  ].filter(Boolean);
  if (programParts.length > 0) {
    sentences.push(`Fields of study: ${programParts.join(", ")}.`);
  }

  const learningStyle = normalizedText(input.learning_style_notes);
  if (learningStyle) {
    sentences.push(`Learning style: ${learningStyle}.`);
  }

  if (input.cost_ceiling !== undefined) {
    sentences.push(`Costs: published cost ceiling $${Math.round(input.cost_ceiling)}.`);
  }

  return sentences.join(" ");
}
