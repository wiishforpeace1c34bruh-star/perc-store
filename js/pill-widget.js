// ─────────────────────────────────────────────────────────────
// pill-widget.js — 3D Rotating Dot-Art Pill for perc.store
// Pure vanilla JS + Canvas 2D. No dependencies.
// ─────────────────────────────────────────────────────────────

/** Characters ordered by visual density (dense → sparse) */
const CHAR_POOL = ['●', '◉', '@', '#', '◎', '%', '⊙', '*', '○', '·', ':', '.'];

/** Depth-color stops (front → back) */
const COLOR_FRONT = [0xec, 0x48, 0x99]; // #ec4899
const COLOR_MID   = [0xf4, 0x72, 0xb6]; // #f472b6
const COLOR_BACK  = [0x6b, 0x72, 0x80]; // #6b7280

/** Animation constants */
const BASE_ROTATE_SPEED = 0.3;      // radians per second (Y axis)
const X_TILT            = 15 * Math.PI / 180; // 15° static tilt
const WOBBLE_AMP        = 0.03;     // subtle breathing amplitude (radians)
const WOBBLE_FREQ       = 0.4;      // breathing frequency (Hz)
const SHIMMER_SPEED     = 1.8;      // character cycling speed
const MOUSE_INFLUENCE   = 0.15;     // max radians mouse can push rotation
const FONT_FAMILY       = 'JetBrains Mono, Geist Mono, monospace';
const FONT_SIZE_MIN     = 8;
const FONT_SIZE_MAX     = 12;
const PERSPECTIVE       = 600;      // perspective divisor (higher = less distortion)

// ─────────────────────────────────────────────────────────────
// Module state (singleton — one widget at a time)
// ─────────────────────────────────────────────────────────────
let _canvas  = null;
let _ctx     = null;
let _raf     = null;
let _points  = [];
let _mouse   = { x: 0, y: 0, active: false };
let _size    = { w: 0, h: 0, dpr: 1, scale: 1 };
let _startTime = 0;
let _resizeObserver = null;
let _onMouseMove = null;
let _onMouseLeave = null;

// ─────────────────────────────────────────────────────────────
// Point cloud generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate evenly-distributed points on a capsule surface.
 * Capsule = cylinder of length `bodyLen` + two hemisphere caps of radius `r`.
 * Uses a Fibonacci-spiral approach on each section for even spacing.
 *
 * @param {number} r        - Radius of the capsule
 * @param {number} bodyLen  - Length of the cylindrical body
 * @param {number} total    - Approximate number of points
 * @returns {{ x: number, y: number, z: number, phase: number }[]}
 */
function generateCapsulePoints(r, bodyLen, total) {
  const points = [];

  // Surface area ratios to distribute points proportionally
  const areaCylinder = 2 * Math.PI * r * bodyLen;
  const areaCaps     = 4 * Math.PI * r * r; // two hemispheres = full sphere
  const areaTotal    = areaCylinder + areaCaps;

  const nCylinder = Math.round(total * (areaCylinder / areaTotal));
  const nCaps     = total - nCylinder;
  const nPerCap   = Math.floor(nCaps / 2);

  // Golden angle for Fibonacci distribution
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // ── Cylinder body ──
  // Points on the cylinder surface, centered at origin, extending along X axis
  const cols = Math.round(Math.sqrt(nCylinder * (bodyLen / (2 * Math.PI * r))));
  const rows = Math.max(1, Math.round(nCylinder / cols));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const theta = (j / cols) * 2 * Math.PI + (i % 2) * (Math.PI / cols); // stagger
      const x = (i / (rows - 1 || 1) - 0.5) * bodyLen;
      const y = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      points.push({ x, y, z, phase: Math.random() * Math.PI * 2 });
    }
  }

  // ── Hemisphere caps (Fibonacci sphere, filtered to hemisphere) ──
  const generateHemisphere = (count, sign) => {
    // Use full Fibonacci sphere but only take the hemisphere we need
    const n = count * 2; // generate full sphere worth, take half
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const phi = Math.acos(1 - 2 * t);
      const theta = goldenAngle * i;
      const sinPhi = Math.sin(phi);

      const lx = r * Math.cos(phi);   // along capsule axis
      const ly = r * sinPhi * Math.cos(theta);
      const lz = r * sinPhi * Math.sin(theta);

      // Only keep points on the correct hemisphere
      if (lx * sign >= 0) {
        points.push({
          x: lx + sign * (bodyLen / 2),
          y: ly,
          z: lz,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  };

  generateHemisphere(nPerCap, 1);  // +X cap
  generateHemisphere(nPerCap, -1); // -X cap

  return points;
}

// ─────────────────────────────────────────────────────────────
// 3D Math helpers
// ─────────────────────────────────────────────────────────────

/** Rotate point around Y axis */
function rotateY(p, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x * cos + p.z * sin,
    y: p.y,
    z: -p.x * sin + p.z * cos,
    phase: p.phase,
  };
}

/** Rotate point around X axis */
function rotateX(p, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x,
    y: p.y * cos - p.z * sin,
    z: p.y * sin + p.z * cos,
    phase: p.phase,
  };
}

/** Perspective project 3D → 2D screen coords */
function project(p, cx, cy, scale, perspective) {
  const d = perspective / (perspective + p.z);
  return {
    sx: cx + p.x * scale * d,
    sy: cy + p.y * scale * d,
    depth: p.z,   // keep raw Z for sorting / shading
    d,            // perspective scale factor
    phase: p.phase,
  };
}

// ─────────────────────────────────────────────────────────────
// Color interpolation
// ─────────────────────────────────────────────────────────────

/**
 * Map a normalised depth (0 = closest, 1 = farthest) to an RGBA color string.
 * Three-stop gradient: front → mid → back.
 */
function depthColor(t, alpha) {
  let r, g, b;
  if (t < 0.5) {
    const u = t * 2; // 0-1 within front→mid
    r = COLOR_FRONT[0] + (COLOR_MID[0] - COLOR_FRONT[0]) * u;
    g = COLOR_FRONT[1] + (COLOR_MID[1] - COLOR_FRONT[1]) * u;
    b = COLOR_FRONT[2] + (COLOR_MID[2] - COLOR_FRONT[2]) * u;
  } else {
    const u = (t - 0.5) * 2; // 0-1 within mid→back
    r = COLOR_MID[0] + (COLOR_BACK[0] - COLOR_MID[0]) * u;
    g = COLOR_MID[1] + (COLOR_BACK[1] - COLOR_MID[1]) * u;
    b = COLOR_MID[2] + (COLOR_BACK[2] - COLOR_MID[2]) * u;
  }
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha.toFixed(3)})`;
}

// ─────────────────────────────────────────────────────────────
// Resize handling
// ─────────────────────────────────────────────────────────────

function handleResize() {
  if (!_canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = _canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  _canvas.width  = Math.round(w * dpr);
  _canvas.height = Math.round(h * dpr);

  // Scale factor: pill should fill ~60% of the smaller dimension
  const minDim = Math.min(w, h);
  _size = { w, h, dpr, scale: minDim * 0.28 };
}

// ─────────────────────────────────────────────────────────────
// Render loop
// ─────────────────────────────────────────────────────────────

function tick(timestamp) {
  if (!_canvas || !_ctx) return;

  const t = (timestamp - _startTime) / 1000; // seconds elapsed

  const { w, h, dpr, scale } = _size;
  const ctx = _ctx;

  // ── Clear ──
  ctx.clearRect(0, 0, w * dpr, h * dpr);

  // ── Compute rotation angles ──
  const yAngle = t * BASE_ROTATE_SPEED
    + (_mouse.active ? (_mouse.x - 0.5) * MOUSE_INFLUENCE * 2 : 0);

  const xAngle = X_TILT
    + Math.sin(t * WOBBLE_FREQ * Math.PI * 2) * WOBBLE_AMP
    + (_mouse.active ? (_mouse.y - 0.5) * MOUSE_INFLUENCE : 0);

  // Breathing scale
  const breathScale = 1 + Math.sin(t * WOBBLE_FREQ * Math.PI * 2 + 0.5) * 0.015;

  // ── Transform & project all points ──
  const cx = (w * dpr) / 2;
  const cy = (h * dpr) / 2;
  const projScale = scale * dpr * breathScale;

  const projected = new Array(_points.length);
  let zMin = Infinity, zMax = -Infinity;

  for (let i = 0; i < _points.length; i++) {
    let p = _points[i];
    p = rotateY(p, yAngle);
    p = rotateX(p, xAngle);
    const pp = project(p, cx, cy, projScale, PERSPECTIVE * dpr);
    projected[i] = pp;
    if (pp.depth < zMin) zMin = pp.depth;
    if (pp.depth > zMax) zMax = pp.depth;
  }

  // ── Sort back-to-front (painter's order) ──
  projected.sort((a, b) => b.depth - a.depth);

  const zRange = zMax - zMin || 1;

  // ── Draw each point ──
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < projected.length; i++) {
    const pp = projected[i];

    // Normalised depth: 0 = front (closest), 1 = back (farthest)
    const depthNorm = (pp.depth - zMin) / zRange;

    // ── Character selection ──
    // Combine depth + time + per-point phase for shimmer
    const charIndex = Math.floor(
      (depthNorm * 4 + t * SHIMMER_SPEED + pp.phase) % CHAR_POOL.length
    );
    const ch = CHAR_POOL[(charIndex + CHAR_POOL.length) % CHAR_POOL.length];

    // ── Font size (closer = larger) ──
    const fontSize = FONT_SIZE_MAX - (FONT_SIZE_MAX - FONT_SIZE_MIN) * depthNorm;
    const scaledSize = fontSize * dpr;
    ctx.font = `${scaledSize.toFixed(1)}px ${FONT_FAMILY}`;

    // ── Color & alpha ──
    // Front points are fully opaque, back points fade slightly
    const alpha = 1.0 - depthNorm * 0.55;
    ctx.fillStyle = depthColor(depthNorm, alpha);

    ctx.fillText(ch, pp.sx, pp.sy);
  }

  _raf = requestAnimationFrame(tick);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Initialise and start the pill widget on the given canvas element.
 *
 * @param {HTMLCanvasElement} canvasElement - The canvas to render into.
 *   Its CSS size determines the render area; it will be automatically
 *   scaled for HiDPI displays.
 */
export function initPillWidget(canvasElement) {
  // Clean up any previous instance
  destroyPillWidget();

  _canvas = canvasElement;
  _ctx    = _canvas.getContext('2d');

  // ── Generate point cloud ──
  // Capsule dimensions (arbitrary units — will be scaled by `_size.scale`)
  const radius  = 0.65;
  const bodyLen = 2.4;
  _points = generateCapsulePoints(radius, bodyLen, 1000);

  // ── Initial sizing ──
  handleResize();

  // ── Mouse interaction ──
  _onMouseMove = (e) => {
    const rect = _canvas.getBoundingClientRect();
    _mouse.x = (e.clientX - rect.left) / rect.width;   // 0-1
    _mouse.y = (e.clientY - rect.top)  / rect.height;   // 0-1
    _mouse.active = true;
  };
  _onMouseLeave = () => { _mouse.active = false; };

  _canvas.addEventListener('mousemove',  _onMouseMove);
  _canvas.addEventListener('mouseleave', _onMouseLeave);

  // ── Resize observer ──
  _resizeObserver = new ResizeObserver(() => handleResize());
  _resizeObserver.observe(_canvas);

  // Also listen for DPR changes (e.g. dragging window between monitors)
  window.addEventListener('resize', handleResize);

  // ── Start render loop ──
  _startTime = performance.now();
  _raf = requestAnimationFrame(tick);
}

/**
 * Stop the animation and release all resources.
 */
export function destroyPillWidget() {
  if (_raf !== null) {
    cancelAnimationFrame(_raf);
    _raf = null;
  }

  if (_resizeObserver) {
    _resizeObserver.disconnect();
    _resizeObserver = null;
  }

  window.removeEventListener('resize', handleResize);

  if (_canvas) {
    if (_onMouseMove)  _canvas.removeEventListener('mousemove',  _onMouseMove);
    if (_onMouseLeave) _canvas.removeEventListener('mouseleave', _onMouseLeave);
  }

  _canvas = null;
  _ctx    = null;
  _points = [];
  _mouse  = { x: 0, y: 0, active: false };
  _onMouseMove = null;
  _onMouseLeave = null;
}
