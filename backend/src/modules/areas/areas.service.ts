import { db } from "../../db/index.js";
import { areas, roads } from "../../db/schema.js";
import { buildDistances, type Distance } from "../../domain/graph.js";

type DhakaMap = { areas: { id: string; name: string }[]; distance: Distance };

let map: Promise<DhakaMap> | undefined;

// The map never changes while the app runs, so it is read and built once, on first use.
// A failed load (database down) is not cached, so the next call tries again.
export function getMap(): Promise<DhakaMap> {
  map ??= loadMap().catch((err) => {
    map = undefined;
    throw err;
  });
  return map;
}

async function loadMap(): Promise<DhakaMap> {
  const areaRows = await db.select({ id: areas.id, name: areas.name }).from(areas).orderBy(areas.name);
  const roadRows = await db.select().from(roads);
  return { areas: areaRows, distance: buildDistances(areaRows.map((a) => a.id), roadRows) };
}
