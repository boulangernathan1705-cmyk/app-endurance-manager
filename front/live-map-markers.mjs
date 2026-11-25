// Bind the SVG markers to the cars in the current redraw. Fast position messages
// update these car objects in place, so animation can reuse the same bindings.
export function bindMapMarkers(frame, svg) {
  const cars = new Map(frame.feed.snap.field.map(car => [car.id, car]));
  frame.svg = svg;
  frame.markers = [];
  for (const node of svg.querySelectorAll('[data-car]')) {
    const car = cars.get(Number(node.dataset.car));
    if (car) frame.markers.push({node, car, transform:node.getAttribute('transform')});
  }
}

export function moveMapMarkers({feed, minX, maxZ, k, markers}, placed, now) {
  for (const marker of markers) {
    const [x, z] = placed(feed, marker.car, now);
    const transform = `translate(${(30 + (x - minX) * k).toFixed(1)},${(30 + (maxZ - z) * k).toFixed(1)})`;
    if (transform === marker.transform) continue;
    marker.node.setAttribute('transform', transform);
    marker.transform = transform;
  }
}
