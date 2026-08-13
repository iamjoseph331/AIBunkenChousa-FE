export type Pos = { x: number; y: number }

/** Fruchterman–Reingold force layout — small, dependency-free, deterministic.
 * Shared by the citation graph (Phase 2) and the concept graph (Phase 3). The
 * corpus is tens–hundreds of nodes, so an O(n²) pass over ~320 iterations is
 * cheap and gives a stable, readable spread that fits a fixed viewBox. */
export function computeLayout(
  nodes: { key: string }[],
  edges: { source: string; target: string }[],
  vw: number,
  vh: number,
  // v0.2 Step 4 fragment: optional per-node group tag. Nodes sharing a group
  // get an additional pull toward the group's centroid, so category coloring
  // reads as visible clustering in the graph. Missing / null → no group pull.
  groups?: Record<string, string | null | undefined>,
): Record<string, Pos> {
  const N = nodes.length
  if (N === 0) return {}
  const idx = new Map(nodes.map((n, i) => [n.key, i]))
  // Seed positions: cluster nodes of the same group on the same arc segment so
  // the layout converges into a group-visible arrangement even before the
  // centroid pull kicks in.
  const groupIds = groups
    ? Array.from(new Set(nodes.map(n => groups[n.key]).filter(g => g != null))) as string[]
    : []
  const groupSlot = new Map<string, number>(groupIds.map((g, i) => [g, i]))
  const groupAnchors = new Map(groupIds.map((g, i) => {
    const angle = (i / Math.max(1, groupIds.length)) * Math.PI * 2
    return [g, { x: vw / 2 + Math.cos(angle) * vw * 0.25, y: vh / 2 + Math.sin(angle) * vh * 0.25 }]
  }))
  const pos: Pos[] = nodes.map((n, i) => {
    const g = groups?.[n.key]
    let baseAngle: number
    if (g != null && groupSlot.has(g)) {
      const slot = groupSlot.get(g)!
      const sectorSize = (Math.PI * 2) / Math.max(1, groupIds.length)
      // spread nodes within a group over a small local arc
      const inGroup = nodes.filter(m => groups?.[m.key] === g).indexOf(n)
      const groupSize = nodes.filter(m => groups?.[m.key] === g).length
      const localOffset = groupSize > 1 ? (inGroup / groupSize) * sectorSize * 0.7 : 0
      baseAngle = slot * sectorSize + localOffset
    } else {
      baseAngle = (i / N) * Math.PI * 2
    }
    return { x: vw / 2 + Math.cos(baseAngle) * vw * 0.28,
             y: vh / 2 + Math.sin(baseAngle) * vh * 0.28 }
  })
  const links = edges
    .map((e) => [idx.get(e.source), idx.get(e.target)] as [number | undefined, number | undefined])
    .filter((l): l is [number, number] => l[0] != null && l[1] != null && l[0] !== l[1])

  const k = Math.sqrt((vw * vh) / Math.max(N, 1)) * 0.55
  const iterations = 320
  for (let it = 0; it < iterations; it++) {
    const disp: Pos[] = pos.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = pos[i].x - pos[j].x
        let dy = pos[i].y - pos[j].y
        const d = Math.hypot(dx, dy) || 0.01
        const rep = (k * k) / d
        dx /= d; dy /= d
        disp[i].x += dx * rep; disp[i].y += dy * rep
        disp[j].x -= dx * rep; disp[j].y -= dy * rep
      }
    }
    for (const [a, b] of links) {
      let dx = pos[a].x - pos[b].x
      let dy = pos[a].y - pos[b].y
      const d = Math.hypot(dx, dy) || 0.01
      const att = (d * d) / k
      dx /= d; dy /= d
      disp[a].x -= dx * att; disp[a].y -= dy * att
      disp[b].x += dx * att; disp[b].y += dy * att
    }
    // Group centroid pull. Recomputed each iteration since positions move.
    let centroids: Record<string, { x: number; y: number; n: number }> | undefined
    if (groups && groupIds.length > 1) {
      centroids = {}
      for (let i = 0; i < N; i++) {
        const g = groups[nodes[i].key]
        if (!g) continue
        const c = centroids[g] ??= { x: 0, y: 0, n: 0 }
        c.x += pos[i].x; c.y += pos[i].y; c.n += 1
      }
      for (const g of groupIds) {
        const c = centroids[g]
        if (c && c.n > 0) { c.x /= c.n; c.y /= c.n }
      }
    }
    const temp = k * (1 - it / iterations)
    for (let i = 0; i < N; i++) {
      disp[i].x += (vw / 2 - pos[i].x) * 0.012
      disp[i].y += (vh / 2 - pos[i].y) * 0.012
      if (centroids) {
        const g = groups![nodes[i].key]
        if (g && centroids[g]) {
          // Keep each category compact, while anchors stop linked nodes from
          // collapsing every category into one indistinguishable centre.
          disp[i].x += (centroids[g].x - pos[i].x) * 0.075
          disp[i].y += (centroids[g].y - pos[i].y) * 0.075
          const anchor = groupAnchors.get(g)
          if (anchor) {
            disp[i].x += (anchor.x - pos[i].x) * 0.035
            disp[i].y += (anchor.y - pos[i].y) * 0.035
          }
        }
      }
      const dl = Math.hypot(disp[i].x, disp[i].y) || 0.01
      const lim = Math.min(dl, temp)
      pos[i].x += (disp[i].x / dl) * lim
      pos[i].y += (disp[i].y / dl) * lim
      pos[i].x = Math.max(40, Math.min(vw - 40, pos[i].x))
      pos[i].y = Math.max(40, Math.min(vh - 40, pos[i].y))
    }
  }
  return Object.fromEntries(nodes.map((n, i) => [n.key, pos[i]]))
}
