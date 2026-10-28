# NEO-KAIDŌ // District 7

A real-time, procedurally generated cyberpunk megacity built with Three.js. Every tower, sign, vehicle and raindrop is generated in the browser — no external models, textures or API keys.

## Run locally

```bash
npm install
npm run dev
```

## Controls

| Key | Action |
| --- | --- |
| `1` / `2` / `3` | Cinematic autopilot / street level / aerial flight |
| `W A S D` | Move · `Shift` sprint / boost |
| `Space` / `C` | Jump (street) · climb / descend (aerial) |
| Click / `F` | Inspect buildings, signs, vehicles, people, holograms |
| `N` | Next cinematic shot |
| `Tab` | Settings (quality, rain, time of day, camera speed, bloom, fog) |
| `H` | Toggle HUD |

## Highlights

- Instanced, chunked procedural city with shader-driven facades and distance LOD
- Planar wet-street reflections with puddles, rain ripples and analytic lamp pools
- GPU rain, splashes, steam, lightning, analytic height fog
- Flying traffic with banking, ground cars, maglev train, police drone with shadowed spotlight
- Animated billboards and blade signs, holographic koi, globe and rooftop sculptures
- Bloom, anamorphic streaks, ACES tone mapping and a cinematic grade
