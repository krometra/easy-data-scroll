export function pictureSvg(w: number, h: number, seed: number): string {
  const hue = (seed * 47) % 360
  const r = Math.min(w, h)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 75% 42%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${w * 0.72}" cy="${h * 0.32}" r="${r * 0.16}" fill="rgba(255,255,255,.55)"/>
<path d="M0 ${h * 0.78} L${w * 0.3} ${h * 0.48} L${w * 0.55} ${h * 0.72} L${w * 0.75} ${h * 0.56} L${w} ${h * 0.8} V${h} H0Z" fill="rgba(0,0,0,.22)"/>
<text x="${w / 2}" y="${h * 0.93}" text-anchor="middle" font-family="sans-serif" font-size="${r * 0.07}" fill="rgba(255,255,255,.8)">${w}×${h} · #${seed}</text>
</svg>`
}
