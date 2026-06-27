import type { Metadata } from "next";

import { CompassExplorer } from "./compass-explorer";

export const metadata: Metadata = {
  title: "Major & Career Compass | Admira",
  description:
    "Explore majors by fit, the careers they open, and sourced earnings, tied to your real admit odds.",
};

export default function CompassPage() {
  return <CompassExplorer />;
}
