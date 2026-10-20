import { catalogue, forecast } from "../server/public-data.mjs";
const cache = new Map();
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
  const url = new URL(req.url, "https://little-meenah-preview.vercel.app");
  const type = url.searchParams.get("type");
  const kind = url.searchParams.get("kind"),
    q = url.searchParams.get("q"),
    city = url.searchParams.get("city");
  if (!["catalogue", "weather"].includes(type))
    return res.status(400).json({ error: "Unsupported data request." });
  if (
    type === "catalogue" &&
    (!["anime", "manga"].includes(kind) ||
      !q ||
      q.trim().length < 2 ||
      q.length > 100)
  )
    return res.status(400).json({ error: "Add a valid anime or manga title." });
  if (type === "weather" && (!city || city.length > 80))
    return res.status(400).json({ error: "Choose a city in Nigeria." });
  const key = JSON.stringify([
    type,
    kind,
    q?.toLowerCase(),
    city?.toLowerCase(),
  ]);
  const saved = cache.get(key);
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=1800",
  );
  if (saved && saved.until > Date.now())
    return res.status(200).json(saved.data);
  try {
    const data =
      type === "catalogue" ? await catalogue(kind, q) : await forecast(city);
    if (cache.size > 300) cache.clear();
    cache.set(key, { until: Date.now() + 300000, data });
    return res.status(200).json(data);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(503)
      .json({
        error:
          type === "catalogue"
            ? "The catalogues could not respond. Try again shortly or add a story manually."
            : e.message.startsWith("City not found")
              ? e.message
              : "Weather could not load. Try again shortly.",
      });
  }
}
