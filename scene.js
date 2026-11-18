import { TAU } from './model.js';

const cameras = {
  '3d': { azimuth: -0.75, elevation: 0.33, roll: 1.30 },
  top: { azimuth: -Math.PI / 2, elevation: Math.PI / 2, roll: 0 },
  side: { azimuth: -Math.PI / 2, elevation: 0, roll: Math.PI / 2 },
};

export function createScene(canvas, scaleLabel, onViewChange) {
  const ctx = canvas.getContext('2d');
  let model, drag;
  let camera = { ...cameras['3d'] };
  let view = '3d';
  let zoom = 1;
  let frame;

  function look([x, y, z]) {
    const cosAz = Math.cos(camera.azimuth);
    const sinAz = Math.sin(camera.azimuth);
    const cosEl = Math.cos(camera.elevation);
    const sinEl = Math.sin(camera.elevation);
    const cosRoll = Math.cos(camera.roll);
    const sinRoll = Math.sin(camera.roll);
    const radial = x * cosAz + y * sinAz;
    const u = y * cosAz - x * sinAz;
    const v = z * cosEl - radial * sinEl;
    return [u * cosRoll + v * sinRoll, u * sinRoll - v * cosRoll, radial * cosEl + z * sinEl];
  }

  function line(a, b, shade, thickness = 1, dash = []) {
    ctx.setLineDash(dash);
    ctx.strokeStyle = shade;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function ring(r, z, project, shade, dash) {
    ctx.strokeStyle = shade;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i <= 84; i++) {
      const theta = TAU * i / 84;
      const [x, y] = project([r * Math.cos(theta), r * Math.sin(theta), z]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function polygon(points, fill, stroke) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function dot(x, y, radius, fill, border) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    if (border) {
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
  }

  function label(value, x, y, right = false) {
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    const width = ctx.measureText(value).width;
    const start = right ? x - width - 5 : x + 5;
    ctx.fillStyle = '#f8f7fdde';
    ctx.fillRect(start - 3, y - 8, width + 6, 16);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5c5577';
    ctx.fillText(value, start, y);
  }

  function roundedScale(value) {
    const order = 10 ** Math.floor(Math.log10(value));
    return [5, 2, 1].find((n) => n * order <= value) * order;
  }

  function draw() {
    if (!model || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const expectedW = Math.round(w * dpr);
    const expectedH = Math.round(h * dpr);
    if (canvas.width !== expectedW || canvas.height !== expectedH) {
      canvas.width = expectedW;
      canvas.height = expectedH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#bfb6d755';
    for (let x = 18; x < w; x += 22) {
      for (let y = 15; y < h; y += 22) ctx.fillRect(x, y, 1.25, 1.25);
    }

    const { radius, span, pitch, points, centerAt, steps } = model;
    const bound = [Infinity, Infinity, -Infinity, -Infinity];
    const axisPad = Math.min(Math.max(radius * 0.75, span * 0.055), 8);
    for (const z of [-axisPad, span + axisPad]) {
      for (let i = 0; i < 48; i++) {
        const theta = TAU * i / 48;
        const [x, y] = look([radius * Math.cos(theta), radius * Math.sin(theta), z]);
        bound[0] = Math.min(bound[0], x);
        bound[1] = Math.min(bound[1], y);
        bound[2] = Math.max(bound[2], x);
        bound[3] = Math.max(bound[3], y);
      }
    }
    const fit = Math.min(
      w * (w < 500 ? 0.87 : 0.82) / (bound[2] - bound[0]),
      h * 0.72 / (bound[3] - bound[1]),
    );
    const scale = fit * zoom;
    const midX = (bound[0] + bound[2]) / 2;
    const midY = (bound[1] + bound[3]) / 2;
    const project = (point) => {
      const [x, y, depth] = look(point);
      return [w / 2 + (x - midX) * scale, h * 0.48 + (y - midY) * scale, depth];
    };
    const length = roundedScale(67 / scale);
    scaleLabel.firstElementChild.style.width = length * scale + 'px';
    scaleLabel.lastElementChild.textContent = Number(length.toPrecision(5)) + ' nm';

    const axisStart = project([0, 0, -axisPad]);
    const axisEnd = project([0, 0, span + axisPad]);
    const front = view !== 'top' && Math.hypot(axisEnd[0] - axisStart[0], axisEnd[1] - axisStart[1]) > 5;
    if (front) {
      for (let i = 0; i < 8; i++) {
        const phi = TAU * i / 8;
        const x = radius * Math.cos(phi);
        const y = radius * Math.sin(phi);
        line(project([x, y, 0]), project([x, y, span]), '#887ca32e', 1, [3, 5]);
      }
      ring(radius, 0, project, '#81739f50', [4, 4]);
      ring(radius, span, project, '#81739f50', [4, 4]);
      if (span >= 1.15 * pitch) ring(radius, pitch, project, '#81739f29', [3, 5]);
      line(axisStart, axisEnd, '#786d9bb3', 1.1, [5, 4]);
      if (axisEnd[0] > 8 && axisEnd[0] < w - 20 && axisEnd[1] > 14 && axisEnd[1] < h - 14) {
        label('+z', axisEnd[0], axisEnd[1], axisEnd[0] > w - 52);
      }
    } else {
      ring(radius, 0, project, '#81739f7a', [4, 4]);
      const [x, y] = project([0, 0, 0]);
      line([x - 5, y], [x + 5, y], '#786d9b', 1);
      line([x, y - 5], [x, y + 5], '#786d9b', 1);
    }

    const items = [];
    const segmentsPerStep = Math.max(2, Math.min(28, Math.ceil(model.angle / 0.075)));
    const segments = steps * segmentsPerStep;
    const backbone = Array.from({ length: segments + 1 }, (_, i) => project(centerAt(steps * i / segments)));
    for (let i = 1; i < backbone.length; i++) {
      const [a, b] = [backbone[i - 1], backbone[i]];
      items.push({ type: 'backbone', depth: (a[2] + b[2]) / 2, a, b });
    }
    const unitHalfLength = Math.min(0.37, Math.hypot(radius, pitch / TAU) * model.angle * 0.32);
    const unitHalfWidth = Math.min(0.26, radius * 0.42);
    const pointRadius = Math.max(2.25, Math.min(4.5, scale * 0.28));
    for (const [i, point] of points.entries()) {
      const center = project(point.center);
      const corners = [[-1, 0], [-0.58, -1], [0.58, -1], [1, 0], [0.58, 1], [-0.58, 1]].map(
        ([t, v]) => project(point.center.map((c, j) => c + t * unitHalfLength * point.tangent[j] + v * unitHalfWidth * point.width[j])),
      );
      const centerDepth = look([0, 0, point.center[2]])[2];
      items.push({ type: 'unit', depth: center[2] + 0.004, center, localDepth: center[2] - centerDepth, corners, i });
    }
    items.sort((left, right) => left.depth - right.depth);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(backbone[0][0], backbone[0][1]);
    for (const [x, y] of backbone.slice(1)) ctx.lineTo(x, y);
    ctx.strokeStyle = '#e0d5fc';
    ctx.lineWidth = pointRadius * 1.8 + 1.6;
    ctx.stroke();
    for (const item of items) {
      if (item.type === 'backbone') {
        const depthHint = Math.max(0, Math.min(1, (item.depth - Math.sin(camera.elevation) * span * 0.5) / (radius * 4) + 0.5));
        line(item.a, item.b, 'hsl(255 73% ' + (73 - 21 * depthHint) + '%)', Math.max(1.9, pointRadius * 0.78));
        continue;
      }
      const closeness = Math.max(0, Math.min(1, (item.localDepth / radius + 1) * 0.5));
      const ink = 'hsl(255 66% ' + (65 - 18 * closeness) + '%)';
      const fill = 'hsl(253 81% ' + (85 - 16 * closeness) + '% / .89)';
      polygon(item.corners, fill, ink);
      dot(item.center[0], item.center[1], pointRadius, ink, '#ffffffc9');
      if (item.i === 0 || item.i === points.length - 1) {
        dot(item.center[0], item.center[1], pointRadius + 1.1, '#5b36d4', '#fff');
      }
    }

    if (front && zoom === 1) {
      const start = project([0, 0, 0]);
      const end = project([0, 0, span]);
      const [dx, dy] = [end[0] - start[0], end[1] - start[1]];
      const pixelLength = Math.hypot(dx, dy);
      if (pixelLength > 110 && span >= pitch) {
        const direction = [dx / pixelLength, dy / pixelLength];
        const offset = Math.min(62, radius * scale * 0.82 + 21);
        const sign = dx < 0 ? -1 : 1;
        const normal = [-direction[1] * sign, direction[0] * sign];
        const aa = [start[0] + normal[0] * offset, start[1] + normal[1] * offset];
        const bb = [aa[0] + dx * pitch / span, aa[1] + dy * pitch / span];
        if (Math.min(aa[1], bb[1]) > 40 && Math.max(aa[1], bb[1]) < h - 35) {
          for (const p of [aa, bb]) {
            line([p[0] - normal[0] * 4, p[1] - normal[1] * 4], [p[0] + normal[0] * 4, p[1] + normal[1] * 4], '#7969a7');
          }
          line(aa, bb, '#8a79b9');
          label('Pitch ' + Number(pitch.toFixed(2)) + ' nm', (aa[0] + bb[0]) / 2 - 37, (aa[1] + bb[1]) / 2 + 12);
        }
      }
    }
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }

  function setView(next) {
    view = next;
    camera = { ...cameras[next] };
    zoom = 1;
    onViewChange(view);
    schedule();
  }

  function rotate(x, y) {
    view = '3d';
    camera.azimuth += x;
    camera.elevation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.elevation + y));
    onViewChange(view);
    schedule();
  }

  function magnify(factor) {
    zoom = Math.max(0.45, Math.min(5, zoom * factor));
    schedule();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = [event.clientX, event.clientY];
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const [x, y] = [event.clientX, event.clientY];
    rotate((x - drag[0]) * 0.009, (y - drag[1]) * 0.009);
    drag = [x, y];
  });
  canvas.addEventListener('lostpointercapture', () => { drag = null; });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    magnify(Math.exp(-event.deltaY * (event.deltaMode === 0 ? 0.0012 : 0.04)));
  }, { passive: false });
  const keys = {
    ArrowLeft: () => rotate(-0.13, 0), ArrowRight: () => rotate(0.13, 0),
    ArrowUp: () => rotate(0, -0.13), ArrowDown: () => rotate(0, 0.13),
    '+': () => magnify(1.15), '=': () => magnify(1.15), '-': () => magnify(1 / 1.15),
    Home: () => setView('3d'),
  };
  canvas.addEventListener('keydown', (event) => {
    if (!Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    keys[event.key]();
  });
  new ResizeObserver(schedule).observe(canvas);

  return {
    render(next) { model = next; schedule(); },
    setView,
  };
}
