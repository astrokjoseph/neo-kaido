// Closed rectangular loops with rounded corners that follow the street grid.
// Used by the elevated train, patrol drones and free-flying traffic.
export function rectPath(x0, z0, x1, z1, r) {
  const w = x1 - x0 - 2 * r, d = z1 - z0 - 2 * r;
  const arc = (Math.PI / 2) * r;
  const segs = [
    { type: 'L', len: w, sx: x0 + r, sz: z0, dx: 1, dz: 0 },
    { type: 'A', len: arc, cx: x1 - r, cz: z0 + r, a0: -Math.PI / 2 },
    { type: 'L', len: d, sx: x1, sz: z0 + r, dx: 0, dz: 1 },
    { type: 'A', len: arc, cx: x1 - r, cz: z1 - r, a0: 0 },
    { type: 'L', len: w, sx: x1 - r, sz: z1, dx: -1, dz: 0 },
    { type: 'A', len: arc, cx: x0 + r, cz: z1 - r, a0: Math.PI / 2 },
    { type: 'L', len: d, sx: x0, sz: z1 - r, dx: 0, dz: -1 },
    { type: 'A', len: arc, cx: x0 + r, cz: z0 + r, a0: Math.PI },
  ];
  const length = segs.reduce((a, s) => a + s.len, 0);
  const out = { x: 0, z: 0, dx: 1, dz: 0, curv: 0 };
  return {
    length,
    at(s) {
      s = ((s % length) + length) % length;
      for (const g of segs) {
        if (s <= g.len) {
          if (g.type === 'L') { out.x = g.sx + g.dx * s; out.z = g.sz + g.dz * s; out.dx = g.dx; out.dz = g.dz; out.curv = 0; }
          else {
            const a = g.a0 + s / r;
            out.x = g.cx + Math.cos(a) * r; out.z = g.cz + Math.sin(a) * r;
            out.dx = -Math.sin(a); out.dz = Math.cos(a); out.curv = 1 / r;
          }
          return out;
        }
        s -= g.len;
      }
      return out;
    },
  };
}
