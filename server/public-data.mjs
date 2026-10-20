async function json(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5000),
    headers: { Accept: "application/json", ...options.headers },
  });
  if (!r.ok) throw Error(`Provider returned ${r.status}`);
  return r.json();
}
export async function catalogue(kind, q) {
  if (
    !["anime", "manga"].includes(kind) ||
    typeof q !== "string" ||
    q.trim().length < 2 ||
    q.length > 100
  )
    throw Error("Use an anime or manga title between 2 and 100 characters.");
  try {
    const d = await json(
      "https://api.jikan.moe/v4/" +
        kind +
        "?" +
        new URLSearchParams({ q: q.trim(), limit: "12", sfw: "true" }),
    );
    if (!Array.isArray(d.data)) throw Error("Invalid catalogue response");
    return {
      provider: "Jikan",
      data: d.data
        .filter(
          (x) => x && Number.isInteger(x.mal_id) && typeof x.title === "string",
        )
        .map((x) => ({
          mal_id: x.mal_id,
          title: x.title,
          episodes: x.episodes,
          chapters: x.chapters,
          type: x.type,
          url: x.url,
          images: { jpg: { image_url: x.images?.jpg?.image_url } },
          sourceId: `mal:${kind === "anime" ? "Anime" : "Manga"}:${x.mal_id}`,
        })),
    };
  } catch {
    const d = await json("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          "query ($search:String,$type:MediaType){Page(perPage:12){media(search:$search,type:$type,isAdult:false){id idMal title{english romaji} coverImage{large} episodes chapters format siteUrl}}}",
        variables: { search: q.trim(), type: kind.toUpperCase() },
      }),
    });
    if (d.errors || !Array.isArray(d.data?.Page?.media))
      throw Error(
        "Both catalogues are unavailable. Try again shortly or add a story manually.",
      );
    return {
      provider: "AniList",
      data: d.data.Page.media.map((x) => ({
        mal_id: x.idMal || x.id,
        title: x.title?.english || x.title?.romaji || "Untitled",
        episodes: x.episodes,
        chapters: x.chapters,
        type: x.format,
        url: x.siteUrl,
        images: { jpg: { image_url: x.coverImage?.large } },
        sourceId: `anilist:${kind}:${x.id}`,
      })),
    };
  }
}
export async function forecast(city) {
  if (typeof city !== "string" || !city.trim() || city.length > 80)
    throw Error("Choose a city in Nigeria.");
  const geo = await json(
    "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({
        name: city,
        count: "10",
        language: "en",
        countryCode: "NG",
      }),
  );
  const place = geo.results?.find((x) => x.country_code === "NG");
  if (!place)
    throw Error("City not found in Nigeria. Choose a nearby larger city.");
  const d = await json(
    "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({
        latitude: place.latitude,
        longitude: place.longitude,
        current: "temperature_2m",
        daily: "precipitation_probability_max",
        forecast_days: "1",
        timezone: "Africa/Lagos",
      }),
  );
  const temperature = d.current?.temperature_2m,
    rain = d.daily?.precipitation_probability_max?.[0];
  if (!Number.isFinite(temperature) || !Number.isFinite(rain))
    throw Error("The weather service returned incomplete data.");
  return {
    temperature: Math.round(temperature),
    rain,
    city: place.name,
    fetched: new Date().toISOString(),
  };
}
