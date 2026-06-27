import "server-only";

import { embedFitDocuments } from "../fit/embed-query";
import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "../fit/embedding-model";
import type { StudentsLikeYouProfileInput } from "./schema";
import { buildSimilarityProfileDocument } from "./index";

export function studentsLikeYouEnabled() {
  return process.env.ADMIRA_STUDENTS_LIKE_YOU_ENABLED === "true";
}

export function slyFeedbackEnabled() {
  return process.env.ADMIRA_SLY_FEEDBACK_ENABLED === "true";
}

export async function embedSimilarityProfile(
  profile: StudentsLikeYouProfileInput,
) {
  const document = buildSimilarityProfileDocument(profile);
  const [vector] = await embedFitDocuments([document]);

  return {
    document,
    vector,
    model: EMBEDDING_MODEL_ID,
    dim: EMBEDDING_DIM,
  };
}
