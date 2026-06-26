import type { Metadata } from "next";

import { SchoolUniverse } from "./school-universe";

export const metadata: Metadata = {
  title: "School Universe | Admira",
  description:
    "A single view of a school's admit profile, programs, cost, outcomes, and similar programs.",
};

export default async function SchoolUniversePage({
  params,
}: {
  params: Promise<{ unitid: string }>;
}) {
  const { unitid } = await params;
  const parsed = Number(unitid);

  if (!Number.isInteger(parsed)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24">
        <p className="text-lg">That school id is not valid.</p>
      </main>
    );
  }

  return <SchoolUniverse unitid={parsed} />;
}
