import "server-only";

import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "./embedding-model";
import { buildFitQueryDocument } from "./query-document";
import type { FitRequest } from "./schema";

export { buildFitQueryDocument };

type TensorLike = {
  tolist: () => unknown;
};

type FeatureExtractor = (
  documents: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<TensorLike>;

type TransformersModule = {
  pipeline: (
    task: "feature-extraction",
    model: string,
  ) => Promise<FeatureExtractor>;
};

let extractorPromise: Promise<FeatureExtractor> | null = null;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import("@xenova/transformers").then((module) => {
      const transformers = module as unknown as TransformersModule;
      return transformers.pipeline("feature-extraction", EMBEDDING_MODEL_ID);
    });
  }

  return extractorPromise;
}

function vectorFromTensor(output: TensorLike) {
  const raw = output.tolist();
  const first = Array.isArray(raw) ? raw[0] : undefined;

  if (!Array.isArray(first)) {
    throw new Error("Embedding output did not include a vector");
  }

  const vector = first.map((value) => Number(value));
  if (
    vector.length !== EMBEDDING_DIM ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Embedding output must be ${EMBEDDING_DIM} finite dimensions`,
    );
  }

  return vector;
}

export async function embedFitDocuments(documents: string[]) {
  const extractor = await getExtractor();
  const output = await extractor(documents, {
    pooling: "mean",
    normalize: true,
  });
  const raw = output.tolist();

  if (!Array.isArray(raw)) {
    throw new Error("Embedding output did not include vectors");
  }

  return raw.map((item) => {
    if (!Array.isArray(item)) {
      throw new Error("Embedding output included a non-vector item");
    }
    const vector = item.map((value) => Number(value));
    if (
      vector.length !== EMBEDDING_DIM ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Embedding output must be ${EMBEDDING_DIM} finite dimensions`,
      );
    }
    return vector;
  });
}

export async function embedFitQuery(input: FitRequest) {
  const document = buildFitQueryDocument(input);
  const extractor = await getExtractor();
  const output = await extractor([document], {
    pooling: "mean",
    normalize: true,
  });
  const vector = vectorFromTensor(output);

  return {
    document,
    vector,
    model: EMBEDDING_MODEL_ID,
    dim: EMBEDDING_DIM,
  };
}

export function resetFitQueryEmbedderForTests() {
  extractorPromise = null;
}
