export type Road = { areaAId: string; areaBId: string; distanceM: number };

// Shortest road distance (meters) between every pair of areas, via Floyd–Warshall.
// Built once at startup from the areas and roads tables.
// ponytail: O(n³) time and O(n²) memory; trivial for 12 areas, not for a real city map.
export function buildDistances(areaIds: string[], roads: Road[]) {
  const n = areaIds.length;
  const index = new Map(areaIds.map((id, i) => [id, i]));
  const indexOf = (id: string) => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`Unknown area: ${id}`);
    return i;
  };

  const dist = areaIds.map((_, i) => areaIds.map((_, j) => (i === j ? 0 : Infinity)));
  for (const { areaAId, areaBId, distanceM } of roads) {
    const a = indexOf(areaAId);
    const b = indexOf(areaBId);
    dist[a][b] = dist[b][a] = distanceM; // roads go both ways
  }

  // Can the trip i → j get shorter by passing through k?
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) dist[i][j] = dist[i][k] + dist[k][j];
      }
    }
  }

  // Fail at startup, not on a passenger's request
  if (dist.some((row) => row.includes(Infinity))) throw new Error("Road graph is not connected");

  return (from: string, to: string) => dist[indexOf(from)][indexOf(to)];
}
