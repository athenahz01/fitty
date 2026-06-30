import type { Metadata } from "next";

import { EssayStudio } from "./essay-studio";

export const metadata: Metadata = {
  title: "Essay studio",
  description:
    "Grounded, specific feedback on your own essay and activity list. Admira never writes your essay for you.",
};

export default function StudioPage() {
  return <EssayStudio />;
}
