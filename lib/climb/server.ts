import "server-only";

export function climbEnabled() {
  return process.env.ADMIRA_CLIMB_ENABLED === "true";
}
