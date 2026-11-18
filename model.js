import { ladder, staircase, transCenter } from './reference.js';

export const TAU = 2 * Math.PI;
export const profiles = {
  study: { label: 'p(g₄ 2T–TT)' },
  bbl: { label: 'trans-BBL' },
};
export const presets = {
  'study-cylinder': { profile: 'study', geometry: 'cylinder', radius: 3, pitch: 22.4, units: 39, handedness: 1 },
  'study-staircase': { profile: 'study', geometry: 'staircase', radius: 3, pitch: 22.4, units: 39, handedness: 1 },
  'bbl-cylinder': { profile: 'bbl', geometry: 'cylinder', radius: 3, pitch: 9.6, units: 40, handedness: 1 },
  'bbl-staircase': { profile: 'bbl', geometry: 'staircase', radius: 3, pitch: 9.6, units: 40, handedness: 1 },
};

function interpolate(table, radius) {
  const index = table.findIndex(([r]) => r >= radius);
  if (index === 0 || table[index][0] === radius) return table[index].slice(1);
  const [lower, ...left] = table[index - 1];
  const [upper, ...right] = table[index];
  const fraction = (radius - lower) / (upper - lower);
  return left.map((value, i) => value + fraction * (right[i] - value));
}

function root(fn, low, high) {
  for (let i = 0; i < 52; i++) {
    const midpoint = (low + high) / 2;
    if (fn(midpoint) > 0) high = midpoint;
    else low = midpoint;
  }
  return (low + high) / 2;
}

function studyTwist(radius, risePerRadian, geometry) {
  const [radial, along, across] = interpolate(geometry === 'cylinder' ? ladder : staircase, radius);
  const length = Math.hypot(radius, risePerRadian);
  const azimuthal = (radius * along - risePerRadian * across) / length;
  const vertical = (risePerRadian * along + radius * across) / length;
  const target = 0.144;
  const components = (angle) => {
    const cosine = Math.cos(angle / 2);
    return [
      -radial * cosine,
      2 * radius * Math.sin(angle / 2) - azimuthal * cosine,
      risePerRadian * angle - vertical,
    ];
  };
  const closestForward = root((angle) => {
    const [, y, z] = components(angle);
    return y * radius + z * risePerRadian;
  }, 0, Math.PI);
  const distance = (angle) => Math.hypot(...components(angle));
  if (distance(closestForward) > target || distance(Math.PI) < target) {
    // In very tight geometries the imposed junction can conflict with the assumed frame.
    return { angle: (Math.hypot(radial, along, across) + target) / length, estimated: true };
  }
  const angle = root((angle) => distance(angle) - target, closestForward, Math.PI);
  return { angle, junction: distance(angle), estimated: false };
}

export function calculate(settings) {
  const { profile, geometry, radius, pitch, units, handedness } = settings;
  if (!Object.hasOwn(profiles, profile) || !['cylinder', 'staircase'].includes(geometry)
    || !(radius >= 0.5 && radius <= 7) || !(pitch >= 0.5 && pitch <= 80)
    || !Number.isInteger(units) || units < 2 || units > 200 || ![1, -1].includes(handedness)) {
    throw new RangeError('Model parameters are outside the supported ranges.');
  }
  const b = pitch / TAU;
  const cylinder = geometry === 'cylinder';
  const result = profile === 'study'
    ? studyTwist(radius, b, geometry)
    : { angle: 1.230719 / Math.hypot(radius, b), estimated: false };
  const centerRadius = profile === 'bbl' && cylinder ? interpolate(transCenter, radius)[0] : radius;
  const steps = units - 1;
  const turns = steps * result.angle / TAU;
  const span = turns * pitch;
  const rise = b * result.angle;
  const twist = handedness * result.angle * 180 / Math.PI;
  const tilt = cylinder ? 90 : Math.atan2(b, radius) * 180 / Math.PI;

  function centerAt(step) {
    const theta = handedness * step * result.angle;
    return [centerRadius * Math.cos(theta), centerRadius * Math.sin(theta), rise * step];
  }

  const length = Math.hypot(radius, b);
  const points = Array.from({ length: units }, (_, i) => {
    const center = centerAt(i);
    const theta = handedness * i * result.angle;
    const radial = [Math.cos(theta), Math.sin(theta), 0];
    const azimuthal = [-Math.sin(theta), Math.cos(theta), 0];
    const tangent = [handedness * azimuthal[0] * radius / length, handedness * azimuthal[1] * radius / length, b / length];
    const width = cylinder
      ? [-handedness * azimuthal[0] * b / length, -handedness * azimuthal[1] * b / length, radius / length]
      : radial;
    return { center, tangent, width };
  });
  return { ...settings, ...result, centerRadius, steps, turns, span, rise, twist, tilt, period: TAU / result.angle, points, centerAt };
}
