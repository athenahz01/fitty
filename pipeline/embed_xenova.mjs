import { readFile, writeFile } from "node:fs/promises";
import { pipeline } from "@xenova/transformers";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error("Usage: node pipeline/embed_xenova.mjs input.json output.json");
}

const payload = JSON.parse(await readFile(inputPath, "utf8"));

if (!payload.modelId || !Array.isArray(payload.documents)) {
  throw new Error("Input must include modelId and documents");
}

const extractor = await pipeline("feature-extraction", payload.modelId);
const output = await extractor(payload.documents, {
  pooling: "mean",
  normalize: true,
});

await writeFile(
  outputPath,
  JSON.stringify(
    {
      modelId: payload.modelId,
      vectors: output.tolist(),
    },
    null,
    2,
  ),
  "utf8",
);
