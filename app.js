const NS = "http://www.w3.org/2000/svg";
const STEPS = 12;
const STEP_ANGLE = (Math.PI * 2) / STEPS;

const TRACKS = [
  {
    id: "blade",
    name: "Blade",
    desc: "glass cut",
    color: "#dce9f0",
    radius: 390,
    glyph: '<path d="M6 26 23 9"/><path d="M18 7l7-1-1 7"/><path d="M8 20l4 4"/><path d="M5 27l3-3"/>',
  },
  {
    id: "hammer",
    name: "Hammer",
    desc: "iron breath",
    color: "#ff6a3d",
    radius: 320,
    glyph: '<path d="M9 23 21 11"/><path d="M18 5l9 9-4 4-9-9Z"/><path d="M6 26l4-4"/>',
  },
  {
    id: "spear",
    name: "Spear",
    desc: "air wound",
    color: "#e9c66b",
    radius: 250,
    glyph: '<path d="M6 26 23 9"/><path d="M20 4l8 0 0 8-8-8Z"/><path d="M8 20l4 4"/><path d="M4 28l4-4"/>',
  },
  {
    id: "chakram",
    name: "Chakram",
    desc: "halo shiver",
    color: "#67d8ca",
    radius: 180,
    glyph: '<circle cx="16" cy="16" r="9"/><circle cx="16" cy="16" r="4"/><path d="M16 7v3M16 22v3M7 16h3M22 16h3"/>',
  },
];

const PRESETS = {
  OBSIDIAN: {
    blade: [0, 3, 6, 9],
    hammer: [0, 6],
    spear: [2, 5, 8, 11],
    chakram: [4, 10],
  },
  PROCESSION: {
    blade: [0, 2, 4, 6, 8, 10],
    hammer: [0, 4, 8],
    spear: [3, 9],
    chakram: [1, 5, 7, 11],
  },
  FRACTURE: {
    blade: [0, 1, 4, 7, 9],
    hammer: [0, 5, 8],
    spear: [2, 6, 10, 11],
    chakram: [3, 7],
  },
  LULLABY: {
    blade: [0, 7],
    hammer: [4],
    spear: [9],
    chakram: [2],
  },
};

const state = {
  bpm: 92,
  volume: 0.78,
  playing: false,
  step: 0,
  patterns: patternsFrom(PRESETS.OBSIDIAN),
  cadence: "OBSIDIAN",
  muted: new Set(),
  lastStepTime: 0,
};

const rings = [];
const countEls = {};
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const body = document.body;
const instrument = document.getElementById("instrument");
const fxLayer = document.getElementById("fx");
const sigilEl = document.getElementById("sigil");
const playBtn = document.getElementById("playBtn");
const playLabel = document.getElementById("playLabel");
const transportState = document.getElementById("transportState");
const cadenceName = document.getElementById("cadenceName");
const stepReadout = document.getElementById("stepReadout");
const bpmInput = document.getElementById("bpm");
const bpmValue = document.getElementById("bpmValue");
const volumeInput = document.getElementById("volume");
const liveStatus = document.getElementById("liveStatus");

/* ── Geometry helpers ────────────────────────────────────── */

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) el.setAttribute(key, value);
  }
  return el;
}

function circle(radius, attrs = {}) {
  return svgEl("circle", { cx: 500, cy: 500, r: radius, ...attrs });
}

function angleForStep(step) {
  return -Math.PI / 2 + step * STEP_ANGLE;
}

function polar(radius, angle) {
  return { x: 500 + Math.cos(angle) * radius, y: 500 + Math.sin(angle) * radius };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function patternsFrom(hits) {
  const result = {};
  for (const track of TRACKS) {
    const row = Array(STEPS).fill(false);
    for (const step of hits[track.id] || []) row[step] = true;
    result[track.id] = row;
  }
  return result;
}

function clonePatterns() {
  const copy = {};
  for (const track of TRACKS) copy[track.id] = state.patterns[track.id].slice();
  return copy;
}

/* ── Build the instrument ────────────────────────────────── */

function buildOrnament() {
  const ornament = document.getElementById("ornament");
  const fragment = document.createDocumentFragment();

  fragment.append(
    circle(484, { class: "guide-dashed" }),
    circle(462, { class: "guide", opacity: 0.7 }),
    circle(444, { class: "guide-dashed" }),
    circle(421, { class: "guide-accent", opacity: 0.55 })
  );

  for (let i = 0; i < 72; i += 1) {
    const angle = (i / 72) * Math.PI * 2 - Math.PI / 2;
    const major = i % 6 === 0;
    const inner = polar(major ? 470 : 475, angle);
    const outer = polar(major ? 482 : 479, angle);
    fragment.append(
      svgEl("line", {
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        class: major ? "tick major" : "tick",
      })
    );
  }

  for (let i = 0; i < 12; i += 1) {
    const angle = angleForStep(i);
    const inner = polar(408, angle);
    const outer = polar(418, angle);
    fragment.append(
      svgEl("line", {
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        class: i === 0 ? "tick major" : "tick",
        opacity: i === 0 ? 0.8 : 0.32,
      })
    );
  }

  ornament.append(fragment);
}

function buildRings() {
  const host = document.getElementById("rings");

  TRACKS.forEach((track) => {
    const group = svgEl("g", { class: "ring", "data-track": track.id });
    group.style.setProperty("--accent", track.color);

    group.append(
      circle(track.radius, { class: "guide" }),
      circle(track.radius - 16, { class: "guide-dashed", opacity: 0.7 })
    );

    const nodes = [];
    for (let step = 0; step < STEPS; step += 1) {
      const angle = angleForStep(step);
      const point = polar(track.radius, angle);
      const degrees = (angle * 180) / Math.PI;
      const node = svgEl("g", {
        class: "node",
        transform: `translate(${point.x} ${point.y}) rotate(${degrees})`,
        tabindex: "0",
        role: "button",
        "aria-pressed": "false",
        "aria-label": `${track.name}, pulse ${step + 1}, quiet`,
        "data-track": track.id,
        "data-step": step,
      });

      node.append(
        svgEl("circle", { class: "node-halo", r: 16 }),
        svgEl("line", { class: "node-line", x1: 9, y1: 0, x2: 31, y2: 0 }),
        svgEl("circle", { class: "node-dot", r: 5.6 }),
        svgEl("circle", { class: "node-hit", r: 40 })
      );

      node.addEventListener("click", () => toggleStep(track.id, step));
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          toggleStep(track.id, step);
        }
      });

      group.append(node);
      nodes.push(node);
    }

    const cursor = svgEl("g", { class: "ring-cursor" });
    cursor.append(
      svgEl("line", { class: "cursor-line", x1: 11, y1: 0, x2: 38, y2: 0 }),
      svgEl("circle", { class: "cursor-dot", r: 4.3 })
    );
    group.append(cursor);
    host.append(group);

    rings.push({ track, group, nodes, cursor });
  });
}

function buildSigil() {
  const spin = document.getElementById("sigilSpin");

  spin.append(
    circle(166, { class: "sigil-guide", opacity: 0.8 }),
    circle(155, { class: "sigil-dash" }),
    circle(116, { class: "sigil-guide", opacity: 0.45 }),
    circle(104, { class: "sigil-dash" }),
    circle(92, { fill: "url(#coreAura)", stroke: "none" })
  );

  for (let i = 0; i < 12; i += 1) {
    const angle = angleForStep(i);
    const inner = polar(160, angle);
    const outer = polar(168, angle);
    spin.append(
      svgEl("line", {
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        class: i % 3 === 0 ? "tick major" : "tick",
        opacity: i % 3 === 0 ? 0.72 : 0.3,
      })
    );
  }

  const petals = svgEl("g", { class: "rot-a" });
  TRACKS.forEach((track, index) => {
    petals.append(
      svgEl("path", {
        d: "M500 350 C540 408 543 464 500 500 C457 464 460 408 500 350 Z",
        class: "sigil-petal",
        fill: track.color,
        "fill-opacity": 0.38,
        transform: `rotate(${index * 90} 500 500)`,
      })
    );
  });
  spin.append(petals);

  const softPetals = svgEl("g", { class: "rot-b" });
  for (let index = 0; index < 8; index += 1) {
    softPetals.append(
      svgEl("path", {
        d: "M500 382 C519 428 519 466 500 500 C481 466 481 428 500 382 Z",
        class: "sigil-petal-soft",
        transform: `rotate(${index * 45 + 22.5} 500 500)`,
      })
    );
  }
  spin.append(softPetals);

  const spokes = svgEl("g");
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8;
    const inner = polar(74, angle);
    const outer = polar(100, angle);
    spokes.append(
      svgEl("line", {
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        class: "tick",
        opacity: 0.46,
      })
    );
  }
  spin.append(spokes);

  const monogram = svgEl("text", { x: 500, y: 506, class: "sigil-text" });
  monogram.textContent = "R W C";

  spin.append(
    circle(62, { class: "sigil-guide", opacity: 0.55 }),
    circle(40, { class: "sigil-dash" }),
    monogram,
    circle(7.5, { class: "sigil-core" })
  );

  sigilEl.style.transformBox = "view-box";
  sigilEl.style.transformOrigin = "500px 500px";
}

function buildWeaponList() {
  const host = document.getElementById("weaponList");

  for (const track of TRACKS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "weapon";
    button.dataset.track = track.id;
    button.style.setProperty("--accent", track.color);
    button.setAttribute("aria-pressed", "true");
    button.innerHTML = `
      <span class="weapon-glyph">
        <svg viewBox="0 0 32 32" aria-hidden="true">${track.glyph}</svg>
      </span>
      <span class="weapon-text">
        <span class="weapon-name">${track.name}</span>
        <span class="weapon-desc">${track.desc}</span>
      </span>
      <span class="weapon-count" data-count="${track.id}">00</span>
    `;
    button.addEventListener("click", () => toggleMute(track.id));
    host.append(button);
    countEls[track.id] = button.querySelector(".weapon-count");
  }
}

/* ── Pattern state ───────────────────────────────────────── */

function syncNode(trackId, step) {
  const ring = rings.find((item) => item.track.id === trackId);
  if (!ring) return;
  const node = ring.nodes[step];
  const armed = state.patterns[trackId][step];
  node.classList.toggle("is-active", armed);
  node.setAttribute("aria-pressed", String(armed));
  node.setAttribute(
    "aria-label",
    `${ring.track.name}, pulse ${step + 1}, ${armed ? "armed" : "quiet"}`
  );
}

function syncAllNodes() {
  for (const track of TRACKS) {
    for (let step = 0; step < STEPS; step += 1) syncNode(track.id, step);
  }
  syncCounts();
}

function syncCounts() {
  for (const track of TRACKS) {
    const count = state.patterns[track.id].filter(Boolean).length;
    if (countEls[track.id]) countEls[track.id].textContent = pad2(count);
  }
}

function syncPresetButtons(activeName) {
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === activeName);
  });
}

function setCadence(name, message) {
  state.cadence = name;
  cadenceName.textContent = name;
  if (message) liveStatus.textContent = message;
}

function setPatterns(patternMap, cadence, activePreset, message) {
  const next = patternsFrom(patternMap);
  for (const track of TRACKS) state.patterns[track.id] = next[track.id];
  setCadence(cadence, message);
  syncAllNodes();
  syncPresetButtons(activePreset);
}

function applyPreset(name) {
  if (!PRESETS[name]) return;
  setPatterns(PRESETS[name], name, name, `Cadence set to ${name.toLowerCase()}.`);
}

function toggleStep(trackId, step) {
  const row = state.patterns[trackId];
  row[step] = !row[step];

  syncNode(trackId, step);
  syncCounts();
  syncPresetButtons(null);
  setCadence(
    "HAND-SET",
    `${TRACKS.find((track) => track.id === trackId).name} pulse ${step + 1} ${
      row[step] ? "armed" : "quiet"
    }.`
  );

  if (row[step]) {
    previewWeapon(trackId);
    flashNode(trackId, step);
  }
}

function flashNode(trackId, step) {
  const ring = rings.find((item) => item.track.id === trackId);
  if (!ring) return;
  const node = ring.nodes[step];
  node.classList.remove("struck");
  void node.getBoundingClientRect();
  node.classList.add("struck");
  window.setTimeout(() => node.classList.remove("struck"), 520);
}

function randomPick(count, required = []) {
  const chosen = new Set(required);
  let guard = 0;
  while (chosen.size < count && guard < 120) {
    chosen.add(Math.floor(Math.random() * STEPS));
    guard += 1;
  }
  return [...chosen].sort((a, b) => a - b);
}

function forgePattern() {
  const patternMap = {
    blade: randomPick(3 + Math.floor(Math.random() * 3)),
    hammer: randomPick(1 + Math.floor(Math.random() * 3), [0]),
    spear: randomPick(2 + Math.floor(Math.random() * 3)),
    chakram: randomPick(1 + Math.floor(Math.random() * 3)),
  };
  setPatterns(patternMap, "FORGED", null, "A new cadence has been forged.");
}

function clearPattern() {
  setPatterns({}, "VOID", null, "The arsenal is silent.");
}

/* ── Muting ──────────────────────────────────────────────── */

function toggleMute(trackId) {
  if (state.muted.has(trackId)) state.muted.delete(trackId);
  else state.muted.add(trackId);
  syncMuteUI();
  const track = TRACKS.find((item) => item.id === trackId);
  liveStatus.textContent = `${track.name} ${state.muted.has(trackId) ? "silenced" : "audible"}.`;
}

function syncMuteUI() {
  for (const track of TRACKS) {
    const muted = state.muted.has(track.id);
    const ring = rings.find((item) => item.track.id === track.id);
    if (ring) ring.group.classList.toggle("is-muted", muted);

    const button = document.querySelector(`.weapon[data-track="${track.id}"]`);
    if (button) {
      button.classList.toggle("is-muted", muted);
      button.setAttribute("aria-pressed", String(!muted));
      const count = state.patterns[track.id].filter(Boolean).length;
      button.setAttribute(
        "aria-label",
        `${track.name}, ${count} strikes, ${muted ? "silenced" : "audible"}. Toggle sound.`
      );
    }
  }
}

/* ── Visual strikes ──────────────────────────────────────── */

function slashPath(angle, offset, length) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const cx = 500 + Math.cos(angle + Math.PI / 2) * offset;
  const cy = 500 + Math.sin(angle + Math.PI / 2) * offset;
  return `M ${cx - dx * (length / 2)} ${cy - dy * (length / 2)} L ${
    cx + dx * (length / 2)
  } ${cy + dy * (length / 2)}`;
}

function arcPath(radius, centerAngle, sweep) {
  const start = centerAngle - sweep / 2;
  const end = centerAngle + sweep / 2;
  const p0 = polar(radius, start);
  const p1 = polar(radius, end);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

function addSparks(group, color, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const innerRadius = 18 + Math.random() * 50;
    const length = 18 + Math.random() * 76;
    const start = polar(innerRadius, angle);
    const end = polar(innerRadius + length, angle);
    const spark = svgEl("line", {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      stroke: color,
      "stroke-width": (0.7 + Math.random() * 1.3).toFixed(2),
      class: "spark",
    });
    spark.style.setProperty("--dx", `${Math.cos(angle) * (28 + Math.random() * 62)}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * (28 + Math.random() * 62)}px`);
    spark.style.animationDelay = `${Math.random() * 0.08}s`;
    group.append(spark);
  }
}

function spawnFX(track, step) {
  if (reducedMotion) return;

  const group = svgEl("g", { class: `strike strike-${track.id}` });
  group.style.setProperty("--accent", track.color);

  group.append(
    svgEl("circle", { class: "flash", cx: 500, cy: 500, r: 86 }),
    svgEl("circle", {
      class: track.id === "hammer" ? "shock" : "shock-soft",
      cx: 500,
      cy: 500,
      r: track.id === "hammer" ? 112 : 92,
      stroke: track.color,
      "stroke-width": track.id === "hammer" ? 2.2 : 1.15,
    })
  );

  if (track.id === "blade") {
    for (let index = 0; index < 2; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const offset = (Math.random() * 2 - 1) * 34;
      const path = svgEl("path", {
        d: slashPath(angle, offset, 310 + Math.random() * 180),
        class: "slash",
        pathLength: "1",
        stroke: track.color,
        "stroke-width": index === 0 ? 2.2 : 1,
        opacity: index === 0 ? 0.9 : 0.55,
      });
      path.style.animationDelay = `${index * 0.035}s`;
      group.append(path);
    }
  }

  if (track.id === "hammer") {
    for (let index = 0; index < 7; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const start = polar(42 + Math.random() * 28, angle);
      const end = polar(120 + Math.random() * 100, angle);
      group.append(
        svgEl("line", {
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          class: "slash",
          pathLength: "1",
          stroke: track.color,
          "stroke-width": 0.8 + Math.random() * 1.2,
          opacity: 0.55,
        })
      );
    }
    for (let index = 0; index < 9; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const point = polar(28 + Math.random() * 120, angle);
      const dust = svgEl("circle", {
        class: "dust",
        cx: point.x,
        cy: point.y,
        r: 1.4 + Math.random() * 3.6,
      });
      dust.style.animationDelay = `${Math.random() * 0.1}s`;
      group.append(dust);
    }
  }

  if (track.id === "spear") {
    const angle = angleForStep(step) + (Math.random() - 0.5) * 0.06;
    const start = polar(track.radius + 22, angle);
    const end = polar(track.radius * 0.3, angle);
    group.append(
      svgEl("path", {
        d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
        class: "slash",
        pathLength: "1",
        stroke: track.color,
        "stroke-width": 2.4,
      })
    );
  }

  if (track.id === "chakram") {
    for (let index = 0; index < 2; index += 1) {
      const radius = 82 + index * 62;
      const path = svgEl("path", {
        d: arcPath(radius, Math.random() * Math.PI * 2, 1.35 + Math.random() * 1.3),
        class: "arc",
        pathLength: "1",
        stroke: track.color,
        "stroke-width": index === 0 ? 2.1 : 1.1,
        opacity: 0.85,
      });
      path.style.animationDelay = `${index * 0.06}s`;
      group.append(path);
    }
  }

  addSparks(group, track.color, track.id === "hammer" ? 15 : 9);

  fxLayer.append(group);
  window.setTimeout(() => group.remove(), 1600);
}

let sigilAnimation = null;

function pulseSigil() {
  if (reducedMotion) return;
  if (sigilAnimation) sigilAnimation.cancel();
  sigilAnimation = sigilEl.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(1.038)", opacity: 0.94 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
  );
}

function showStep(step, time) {
  state.step = step;
  state.lastStepTime = time;
  stepReadout.textContent = pad2(step + 1);

  let struck = false;
  for (const track of TRACKS) {
    if (!state.patterns[track.id][step]) continue;
    struck = true;
    flashNode(track.id, step);
    spawnFX(track, step);
  }

  if (struck) pulseSigil();
}

function updateCursors() {
  if (!state.playing) return;
  let progress = 0;
  if (audio.ctx && state.lastStepTime) {
    const duration = stepDuration();
    progress = clamp((audio.ctx.currentTime - state.lastStepTime) / duration, 0, 1);
  }
  const angle = angleForStep(state.step) + progress * STEP_ANGLE;
  const degrees = (angle * 180) / Math.PI;

  for (const ring of rings) {
    const point = polar(ring.track.radius, angle);
    ring.cursor.setAttribute(
      "transform",
      `translate(${point.x} ${point.y}) rotate(${degrees})`
    );
  }
}

/* ── Audio ───────────────────────────────────────────────── */

const audio = {
  ctx: null,
  master: null,
  reverb: null,
  noise: null,
  drone: null,
};

function volumeGain(value) {
  return Math.pow(clamp(value, 0, 1), 1.4) * 0.9;
}

function makeNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function makeImpulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const envelope = Math.pow(1 - index / length, decay);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return buffer;
}

function initAudio() {
  if (audio.ctx) {
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;

  const ctx = new AudioCtor();
  const master = ctx.createGain();
  master.gain.value = volumeGain(state.volume);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 24;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.8, 3.1);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.42;

  master.connect(compressor).connect(ctx.destination);
  reverb.connect(reverbReturn).connect(master);

  audio.ctx = ctx;
  audio.master = master;
  audio.reverb = reverb;
  audio.noise = makeNoiseBuffer(ctx);
  makeDrone();
}

function output(node, wet = 0.22, pan = 0) {
  const ctx = audio.ctx;
  let tail = node;

  if (pan && typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    tail.connect(panner);
    tail = panner;
  }

  tail.connect(audio.master);

  if (wet > 0) {
    const send = ctx.createGain();
    send.gain.value = wet;
    tail.connect(send).connect(audio.reverb);
  }
}

function envelope(param, time, peak, attack, decay) {
  param.cancelScheduledValues(time);
  param.setValueAtTime(0.0001, time);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
  param.exponentialRampToValueAtTime(0.0001, time + attack + decay);
}

function noiseSource(time, duration) {
  const source = audio.ctx.createBufferSource();
  source.buffer = audio.noise;
  source.loop = true;
  source.start(time, Math.random() * 1.2, duration);
  return source;
}

function noiseBurst(time, options) {
  const {
    duration,
    peak,
    type = "bandpass",
    startFreq = 1200,
    endFreq = startFreq,
    q = 1,
    wet = 0.22,
    pan = 0,
  } = options;

  const source = noiseSource(time, duration);
  const filter = audio.ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(startFreq, time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), time + duration);

  const gain = audio.ctx.createGain();
  envelope(gain.gain, time, peak, 0.004, duration);

  source.connect(filter).connect(gain);
  output(gain, wet, pan);
}

function blip(type, startFreq, endFreq, time, duration, peak, wet = 0.2, pan = 0) {
  const osc = audio.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, time);
  if (endFreq && endFreq !== startFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), time + duration);
  }

  const gain = audio.ctx.createGain();
  envelope(gain.gain, time, peak, 0.003, duration);

  osc.connect(gain);
  output(gain, wet, pan);
  osc.start(time);
  osc.stop(time + duration + 0.04);
}

function playBlade(time, gainScale = 1) {
  noiseBurst(time, {
    duration: 0.16,
    peak: 0.14 * gainScale,
    type: "bandpass",
    startFreq: 6400,
    endFreq: 1800,
    q: 1.2,
    wet: 0.4,
    pan: (Math.random() * 2 - 1) * 0.45,
  });
  blip(
    "triangle",
    2600,
    1580,
    time,
    0.12,
    0.045 * gainScale,
    0.5,
    (Math.random() * 2 - 1) * 0.55
  );
}

function playHammer(time, gainScale = 1) {
  blip("sine", 128, 36, time, 0.34, 0.38 * gainScale, 0.12);
  blip("triangle", 78, 42, time, 0.26, 0.12 * gainScale, 0.08);
  noiseBurst(time, {
    duration: 0.26,
    peak: 0.2 * gainScale,
    type: "lowpass",
    startFreq: 360,
    endFreq: 110,
    q: 0.8,
    wet: 0.18,
  });
}

function playSpear(time, gainScale = 1) {
  noiseBurst(time, {
    duration: 0.19,
    peak: 0.13 * gainScale,
    type: "bandpass",
    startFreq: 760,
    endFreq: 5200,
    q: 0.75,
    wet: 0.42,
    pan: (Math.random() * 2 - 1) * 0.5,
  });
  blip("triangle", 3200, 1900, time, 0.055, 0.032 * gainScale, 0.55);
}

function playChakram(time, gainScale = 1) {
  const base = 780 + Math.random() * 160;
  const partials = [1, 1.52, 2.07, 2.71];
  partials.forEach((partial, index) => {
    blip(
      index % 2 === 0 ? "sine" : "triangle",
      base * partial,
      base * partial * 0.985,
      time + index * 0.006,
      0.58 + index * 0.08,
      (0.038 - index * 0.006) * gainScale,
      0.58,
      (Math.random() * 2 - 1) * 0.65
    );
  });
  noiseBurst(time, {
    duration: 0.24,
    peak: 0.06 * gainScale,
    type: "highpass",
    startFreq: 4800,
    endFreq: 6200,
    q: 0.6,
    wet: 0.6,
    pan: (Math.random() * 2 - 1) * 0.7,
  });
}

function playWeapon(trackId, time, gainScale = 1) {
  if (!audio.ctx) return;
  if (trackId === "blade") playBlade(time, gainScale);
  if (trackId === "hammer") playHammer(time, gainScale);
  if (trackId === "spear") playSpear(time, gainScale);
  if (trackId === "chakram") playChakram(time, gainScale);
}

function previewWeapon(trackId) {
  initAudio();
  if (!audio.ctx) return;
  if (audio.ctx.state === "suspended") audio.ctx.resume();
  playWeapon(trackId, audio.ctx.currentTime + 0.015, 0.55);
}

function makeDrone() {
  const ctx = audio.ctx;
  const gain = ctx.createGain();
  gain.gain.value = 0;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 210;
  filter.Q.value = 0.75;

  const frequencies = [55, 55.35, 82.5, 110.15];
  frequencies.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    osc.type = index % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = frequency;
    const voice = ctx.createGain();
    voice.gain.value = index < 2 ? 0.24 : 0.1;
    osc.connect(voice).connect(filter);
    osc.start();
  });

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.065;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 48;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  filter.connect(gain).connect(audio.master);
  audio.drone = gain;
}

function setDrone(active) {
  if (!audio.drone || !audio.ctx) return;
  audio.drone.gain.setTargetAtTime(active ? 0.028 : 0, audio.ctx.currentTime, 0.55);
}

/* ── Transport / scheduler ───────────────────────────────── */

let schedulerTimer = null;
let nextStepTime = 0;
let nextStepIndex = 0;
let visualQueue = [];

function stepDuration() {
  return 60 / state.bpm / 3;
}

function scheduleStep() {
  const ctx = audio.ctx;
  const step = nextStepIndex;

  for (const track of TRACKS) {
    if (state.patterns[track.id][step] && !state.muted.has(track.id)) {
      playWeapon(track.id, nextStepTime);
    }
  }

  visualQueue.push({ step, time: nextStepTime });
  nextStepIndex = (nextStepIndex + 1) % STEPS;
  nextStepTime += stepDuration();
}

function scheduler() {
  if (!state.playing || !audio.ctx) return;
  if (nextStepTime < audio.ctx.currentTime - 0.12) {
    nextStepTime = audio.ctx.currentTime + 0.03;
  }
  const horizon = audio.ctx.currentTime + 0.12;
  while (nextStepTime < horizon && state.playing) scheduleStep();
}

function startPlayback() {
  if (state.playing) return;
  initAudio();
  if (!audio.ctx) return;
  if (audio.ctx.state === "suspended") audio.ctx.resume();

  state.playing = true;
  state.step = 0;
  state.lastStepTime = audio.ctx.currentTime + 0.08;
  nextStepIndex = 0;
  nextStepTime = state.lastStepTime;
  visualQueue = [];

  body.classList.add("is-playing");
  setPlayingUI(true);
  setDrone(true);

  scheduler();
  schedulerTimer = window.setInterval(scheduler, 25);
}

function stopPlayback() {
  if (!state.playing) return;
  state.playing = false;
  window.clearInterval(schedulerTimer);
  schedulerTimer = null;
  visualQueue = [];
  stepReadout.textContent = "—";
  body.classList.remove("is-playing");
  setPlayingUI(false);
  setDrone(false);
}

function togglePlayback() {
  if (state.playing) stopPlayback();
  else startPlayback();
}

function setPlayingUI(playing) {
  transportState.innerHTML = `<i></i>${playing ? "IN MOTION" : "STANDBY"}`;
  playLabel.textContent = playing ? "Halt cadence" : "Begin cadence";
  playBtn.setAttribute("aria-label", playing ? "Pause cadence" : "Begin cadence");
  liveStatus.textContent = playing ? "Cadence in motion." : "Cadence halted.";
}

function frame() {
  if (state.playing && audio.ctx) {
    const now = audio.ctx.currentTime;
    while (visualQueue.length && visualQueue[0].time <= now + 0.012) {
      const event = visualQueue.shift();
      showStep(event.step, event.time);
    }
    updateCursors();
  }
  window.requestAnimationFrame(frame);
}

/* ── Controls ────────────────────────────────────────────── */

function syncRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  input.style.setProperty("--fill", `${((value - min) / (max - min)) * 100}%`);
}

function setBpm(value) {
  state.bpm = clamp(Math.round(value), 56, 160);
  bpmInput.value = String(state.bpm);
  bpmValue.innerHTML = `${state.bpm} <span>BPM</span>`;
  syncRangeFill(bpmInput);
}

function setVolume(value) {
  state.volume = clamp(value / 100, 0, 1);
  if (audio.master && audio.ctx) {
    audio.master.gain.setTargetAtTime(volumeGain(state.volume), audio.ctx.currentTime, 0.05);
  }
  body.classList.toggle("is-muted", state.volume === 0);
  syncRangeFill(volumeInput);
}

function bindControls() {
  playBtn.addEventListener("click", togglePlayback);

  bpmInput.addEventListener("input", () => setBpm(Number(bpmInput.value)));
  volumeInput.addEventListener("input", () => setVolume(Number(volumeInput.value)));

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });

  document.getElementById("forgeBtn").addEventListener("click", forgePattern);
  document.getElementById("clearBtn").addEventListener("click", clearPattern);

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest("button, input, [role='button']")) return;

    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
      return;
    }

    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      forgePattern();
      return;
    }

    const digit = Number(event.key);
    if (digit >= 1 && digit <= TRACKS.length) {
      toggleMute(TRACKS[digit - 1].id);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) visualQueue = [];
  });

  window.addEventListener("resize", () => {
    updateCursors();
  });
}

/* ── Boot ────────────────────────────────────────────────── */

buildOrnament();
buildRings();
buildSigil();
buildWeaponList();
syncAllNodes();
syncMuteUI();
syncPresetButtons("OBSIDIAN");
setBpm(state.bpm);
volumeInput.value = String(Math.round(state.volume * 100));
setVolume(Number(volumeInput.value));
bindControls();
window.requestAnimationFrame(frame);
