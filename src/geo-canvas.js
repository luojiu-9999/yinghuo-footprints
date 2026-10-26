import { publicURL } from './urls.js';
export function geometryPolygons(geometry) { return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []; }
const mercator = ([x, y]) => [x, -180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, y)) * Math.PI / 360))];
export function mapGeometry(geo, width, height, padding = 30) {
  const features = geo.features.filter(f => Number.isFinite(Number(f.properties.adcode)) && Number(f.properties.adcode) > 0 && geometryPolygons(f.geometry).length);
  const points = features.flatMap(f => geometryPolygons(f.geometry).flat(2).map(mercator));
  if (!points.length) throw new Error('此地图没有可用区域边界');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const scale = Math.min((width - 2 * padding) / Math.max(0.001, maxX - minX), (height - 2 * padding) / Math.max(0.001, maxY - minY));
  const ox = (width - (maxX - minX) * scale) / 2, oy = (height - (maxY - minY) * scale) / 2;
  const project = coordinates => { const [x, y] = mercator(coordinates); return [ox + (x - minX) * scale, oy + (y - minY) * scale]; };
  const items = features.map(feature => {
    const polygons = geometryPolygons(feature.geometry).map(polygon => polygon.map(ring => ring.map(project)));
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const polygon of polygons) for (const ring of polygon) for (const [x,y] of ring) { x1 = Math.min(x1,x); x2 = Math.max(x2,x); y1 = Math.min(y1,y); y2 = Math.max(y2,y); }
    return { code: Number(feature.properties.adcode), name: feature.properties.name, polygons, box: [x1,y1,x2-x1,y2-y1], center: project(feature.properties.center || feature.properties.centroid || [0,0]) };
  });
  return { items, project };
}
export function regionPath(item) { const path = new Path2D(); for (const polygon of item.polygons) for (const ring of polygon) { ring.forEach(([x,y], i) => i ? path.lineTo(x,y) : path.moveTo(x,y)); path.closePath(); } return path; }
export function drawMapBase(ctx, geometry, dark = false) {
  for (const item of geometry.items) { const path = regionPath(item); ctx.fillStyle = dark ? '#183c42' : '#e7efea'; ctx.fill(path,'evenodd'); ctx.strokeStyle = dark ? '#48726e' : '#fff'; ctx.lineWidth = 1; ctx.stroke(path); }
}
export function drawCover(ctx, image, box, crop = {}) {
  const [x,y,w,h] = box, zoom = crop.zoom || 1;
  const scale = Math.max(w/image.width,h/image.height) * zoom, dw = image.width*scale, dh = image.height*scale;
  ctx.drawImage(image, x-(dw-w)*(crop.x ?? 50)/100, y-(dh-h)*(crop.y ?? 50)/100, dw, dh);
}
export async function loadImage(source) { const image = new Image(); image.src = publicURL(source); await image.decode(); return image; }
export function curvePoint(a, b, t) { const dx = b[0]-a[0], dy = b[1]-a[1], c = [ (a[0]+b[0])/2+dy*0.15, (a[1]+b[1])/2-dx*0.15-((dx||dy)?0:25) ]; return [(1-t)**2*a[0]+2*(1-t)*t*c[0]+t*t*b[0],(1-t)**2*a[1]+2*(1-t)*t*c[1]+t*t*b[1]]; }
