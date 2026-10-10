export const permissions = [
  "dashboard.read",
  "polls.read",
  "polls.manage",
  "ideas.read",
  "ideas.moderate",
  "decisions.read",
  "decisions.manage",
  "planning.read",
  "planning.manage",
  "modules.read",
  "modules.manage",
  "audit.read",
  "operations.manage",
  "users.manage",
  "github.manage",
] as const;
export type Permission = (typeof permissions)[number];
export type Role = "owner" | "moderator" | "viewer";
const defaults: Record<Role, readonly Permission[]> = {
  owner: permissions,
  moderator: [
    "dashboard.read",
    "polls.read",
    "ideas.read",
    "ideas.moderate",
    "decisions.read",
  ],
  viewer: [
    "dashboard.read",
    "polls.read",
    "decisions.read",
    "planning.read",
    "modules.read",
  ],
};
const ownerOnly: readonly Permission[] = [
  "polls.manage",
  "decisions.manage",
  "planning.manage",
  "modules.manage",
  "operations.manage",
  "users.manage",
  "github.manage",
];
export function grants(role: Role, extra: Permission[] = []): Permission[] {
  return [
    ...new Set([
      ...defaults[role],
      ...extra.filter((p) => role === "owner" || !ownerOnly.includes(p)),
    ]),
  ];
}
export function requiredPermission(method: string, path: string): Permission {
  const read = method === "GET";
  if (path.includes("/github")) return "github.manage";
  if (path.startsWith("/api/admin/polls"))
    return read ? "polls.read" : "polls.manage";
  if (
    path.startsWith("/api/admin/ideas") ||
    path.startsWith("/api/admin/appeals")
  )
    return read ? "ideas.read" : "ideas.moderate";
  if (
    path.startsWith("/api/admin/decisions") ||
    path.startsWith("/api/admin/evaluations")
  )
    return read ? "decisions.read" : "decisions.manage";
  if (path.startsWith("/api/admin/tasks"))
    return read ? "planning.read" : "planning.manage";
  if (path.startsWith("/api/admin/modules"))
    return read ? "modules.read" : "modules.manage";
  if (path.startsWith("/api/admin/users")) return "users.manage";
  if (path.startsWith("/api/admin/audit")) return "audit.read";
  if (path.endsWith("/dashboard") || path.endsWith("/logout"))
    return "dashboard.read";
  return read ? "audit.read" : "operations.manage";
}
