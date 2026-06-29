import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Students Like You | Admira",
  description: "View k-safe similar-student outcome context.",
};

export default function StudentsLikeYouPage() {
  return <AdmiraApp view="students-like-you" />;
}
