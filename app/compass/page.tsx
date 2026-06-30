import type { Metadata } from "next";

import { CompassExplorer } from "./compass-explorer";

export const metadata: Metadata = {
  title: "Majors & careers",
  description:
    "Explore majors by fit, the careers they open, and sourced earnings, tied to your real admit odds.",
};

export default function CompassPage() {
  return <CompassExplorer />;
}
