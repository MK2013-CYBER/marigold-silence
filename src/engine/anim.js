/**
 * Mixamo walk cycles move the hips forward ("root motion"). The game moves the character
 * itself, so the hips must walk on the spot, or the body slides ahead and snaps back each loop.
 * Which axis carries the travel depends on how the file was exported, so find it: any axis
 * whose value ends far from where it started is travel; flatten it. The bob (up and down)
 * starts and ends at the same height, so it stays. Returns the distance one loop travels.
 */
export function stripRootMotion(clip) {
  let travelled = 0;
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const v = t.values;
    const n = v.length / 3;
    if (n < 2) continue;
    for (let a = 0; a < 3; a++) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) { lo = Math.min(lo, v[i * 3 + a]); hi = Math.max(hi, v[i * 3 + a]); }
      const travel = Math.abs(v[(n - 1) * 3 + a] - v[a]);
      if (travel > 0.5 * (hi - lo) && hi - lo > 1e-3) {
        // linear travel: remove the straight-line drift, keep any small sway around it
        const start = v[a], end = v[(n - 1) * 3 + a];
        travelled = Math.max(travelled, Math.abs(end - start));
        for (let i = 0; i < n; i++) v[i * 3 + a] -= start + ((end - start) * i) / (n - 1) - start;
      }
    }
  }
  return travelled; // distance one loop covers, in the skeleton's own units
}
