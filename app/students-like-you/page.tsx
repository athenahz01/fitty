import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Students like you",
  description: "See where students with profiles like yours got in.",
};

export default function StudentsLikeYouPage() {
  return <AdmiraApp view="students-like-you" />;
}
