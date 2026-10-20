import { discover, requireConsumerOwner } from "./connect.mjs";
export function connectionCards(discoveries) {
  const cards = new Map();
  for (const d of discoveries)
    for (const t of d?.toolkit_connection_statuses || [])
      for (const a of t.accounts || []) {
        if (
          !a.id ||
          !t.toolkit ||
          !(a.status === "ACTIVE" || (!a.status && t.has_active_connection))
        )
          continue;
        const key = `${t.toolkit}:${a.id}`;
        cards.set(key, {
          id: a.id,
          toolkit: t.toolkit,
          alias: a.alias || t.toolkit,
          status: "ACTIVE",
        });
      }
  return [...cards.values()];
}
export async function consumerInventory(user) {
  requireConsumerOwner(user);
  // Discovery requests inspect account metadata only; they never execute provider tools.
  const queries = [
    "Find available Gmail, Google Calendar and Google Drive tools and their account connections.",
    "Find available Slack, Notion and task management tools and their account connections.",
    "Find available GitHub, Vercel and cloud storage tools and their account connections.",
  ];
  const results = await Promise.allSettled(
    queries.map((q) => discover(user, q)),
  );
  const found = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value.discovery);
  if (!found.length) throw results.find((r) => r.status === "rejected").reason;
  // Search is not an exhaustive account-list API. Do not misrepresent its coverage.
  return { accounts: connectionCards(found), partial: true };
}
