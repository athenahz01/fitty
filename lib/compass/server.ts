import "server-only";

import { embedFitDocuments } from "../fit/embed-query";
import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "../fit/embedding-model";

export function compassEnabled() {
  return process.env.ADMIRA_COMPASS_ENABLED === "true";
}

function cosine(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

// Embed the student's interests once and each major once, then score major fit
// by cosine similarity. Reuses the shared Xenova embedding stack.
export async function majorSimilarities(
  interests: string | undefined,
  majorNames: string[],
): Promise<Record<string, number>> {
  if (!interests || interests.trim().length === 0 || majorNames.length === 0) {
    return {};
  }
  const [interestVector, ...majorVectors] = await embedFitDocuments([
    `Student interests: ${interests}.`,
    ...majorNames.map((name) => `Field of study: ${name}.`),
  ]);

  const result: Record<string, number> = {};
  majorNames.forEach((name, index) => {
    result[name] = Math.max(0, cosine(interestVector, majorVectors[index]));
  });
  return result;
}

export { EMBEDDING_DIM, EMBEDDING_MODEL_ID };
