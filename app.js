import { calculate, presets, profiles } from './model.js';
import { createScene } from './scene.js';

const element = (id) => document.getElementById(id);
const defaults = 'study-cylinder';
let settings = { ...presets[defaults] };
let model;

const preset = element('preset');
const numericFields = ['radius', 'pitch', 'units'];
const viewButtons = [...document.querySelectorAll('[data-view]')];
const scene = createScene(element('scene'), element('scale-label'), (view) => {
  for (const button of viewButtons) button.setAttribute('aria-pressed', button.dataset.view === view);
});

function syncField(key) {
  const slider = element(key);
  const input = element(key + '-number');
  slider.value = settings[key];
  input.value = settings[key];
  const fraction = (settings[key] - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
  slider.style.setProperty('--fill', (fraction * 100) + '%');
}

function syncParameters() {
  for (const key of numericFields) syncField(key);
  for (const key of ['geometry', 'handedness']) {
    for (const radio of document.querySelectorAll('input[name=' + key + ']')) {
      radio.checked = radio.value === String(settings[key]);
    }
  }
}

function render() {
  model = calculate(settings);
  scene.render(model);
  const hand = model.handedness === 1 ? 'Right-handed' : 'Left-handed';
  const letter = model.handedness === 1 ? 'P' : 'M';
  const ref = profiles[model.profile];
  const geometry = model.geometry === 'cylinder' ? 'Cylindrical' : 'Staircase';
  element('model-name').textContent = geometry;
  element('model-hand').textContent = letter + ' · ' + hand;
  element('reference-note').textContent = 'Reference · ' + ref.label;
  element('metric-turns').textContent = model.turns.toFixed(3);
  element('metric-period').textContent = model.period.toFixed(2);
  element('metric-span').textContent = model.span.toFixed(2);
  element('metric-twist').textContent = (model.twist < 0 ? '−' : '') + Math.abs(model.twist).toFixed(2);
  element('twist-direction').textContent = hand + ' rotation';
  const warning = element('model-warning');
  warning.hidden = !model.estimated;
  warning.textContent = model.estimated
    ? 'Estimated spacing. This geometry cannot satisfy the 1.44 Å junction constraint in the fitted frame.'
    : '';
  const hasOffset = Math.abs(model.centerRadius - model.radius) > 1e-9;
  const centerLabel = hasOffset ? ' · Center radius ' + model.centerRadius.toFixed(3) + ' nm' : '';
  element('footer-model').textContent = ref.label + ' · ' + model.units + ' units' + centerLabel;
  const referenceMethod = model.profile === 'study'
    ? '<strong>p(g₄ 2T–TT).</strong> The radius is measured at the C1–C31 midpoint of each repeat. The angular step comes from a 1.44 Å C–C junction constraint using vectors recovered from the archived 39-unit models. Intermediate radii interpolate those vectors. Changing pitch reorients the same local frame as a geometry estimate.'
    : '<strong>trans-BBL.</strong> The nominal radius is the cylinder surface radius for the ladder and the repeat-center radius for the staircase. Angular spacing uses the archived 1.230719 nm contour step. The ladder center radius uses the offset tabulated at 9.6 nm. Custom pitch uses the same contour step and offset as a geometry estimate.';
  element('method-body').innerHTML = '<p>' + referenceMethod + '</p>'
    + '<p><strong>Geometry.</strong> The cylindrical (ladder) repeat plane is tangent to the cylinder. '
    + 'The staircase plane contains the chain tangent and radial direction. Its ideal tilt to the xy plane is '
    + '<code>atan(P / (2πR))</code>. The active plane tilt is ' + model.tilt.toFixed(2) + '°. '
    + 'The viewer and CSV describe an idealized repeat-unit geometry.</p>'
    + '<p><strong>Counts.</strong> The first and last of <code>N</code> repeat units are separated by <code>N − 1</code> steps. '
    + '<code>Units per period = 360° / |Δφ|</code>, <code>turns = (N − 1) / units per period</code>, and <code>axial span = turns × pitch</code>. '
    + 'Pitch is the axial rise per full turn. Positive twist increases azimuth as z increases. '
    + 'The period can be fractional.</p>';
}

function update(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  preset.value = 'custom';
  render();
}

function applyPreset(id) {
  if (id === 'custom') return;
  settings = { ...presets[id] };
  preset.value = id;
  syncParameters();
  render();
}

for (const key of numericFields) {
  const slider = element(key);
  const input = element(key + '-number');
  slider.addEventListener('input', () => {
    update(key, slider.valueAsNumber);
    syncField(key);
  });
  input.addEventListener('input', () => {
    if (!input.value || !input.validity.valid) return;
    update(key, input.valueAsNumber);
    const fraction = (settings[key] - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
    slider.value = settings[key];
    slider.style.setProperty('--fill', (fraction * 100) + '%');
  });
  input.addEventListener('change', () => {
    if (Number.isFinite(input.valueAsNumber)) {
      const value = Math.min(Number(input.max), Math.max(Number(input.min), input.valueAsNumber));
      const rounded = Math.round(value / Number(input.step)) * Number(input.step);
      update(key, Number(rounded.toFixed(4)));
    }
    syncField(key);
  });
  input.addEventListener('blur', () => syncField(key));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
}

for (const key of ['geometry', 'handedness']) {
  for (const radio of document.querySelectorAll('input[name=' + key + ']')) {
    radio.addEventListener('change', () => update(key, key === 'handedness' ? Number(radio.value) : radio.value));
  }
}

preset.addEventListener('change', () => applyPreset(preset.value));
element('reset').addEventListener('click', () => applyPreset(defaults));
element('reset-camera').addEventListener('click', () => scene.setView('3d'));
for (const button of viewButtons) button.addEventListener('click', () => scene.setView(button.dataset.view));

element('export').addEventListener('click', () => {
  const head = 'repeat,x_nm,y_nm,z_nm,tangent_x,tangent_y,tangent_z,width_x,width_y,width_z';
  const rows = model.points.map(({ center, tangent, width }, i) =>
    [i + 1, ...[...center, ...tangent, ...width].map((value) => value.toFixed(7))].join(','));
  const blob = new Blob([[head, ...rows].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const material = model.profile === 'study' ? 'g4-2T-TT' : 'trans-BBL';
  const hand = model.handedness === 1 ? 'P' : 'M';
  link.href = url;
  link.download = [material, model.geometry, model.units + 'units', 'R' + model.radius + 'nm', 'P' + model.pitch + 'nm', hand].join('_') + '.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

applyPreset(defaults);
