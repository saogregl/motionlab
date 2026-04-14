import type { CommandFunctionShape } from '../stores/mechanism.js';

export interface FunctionSamples {
  times: number[];
  values: number[];
}

/**
 * Evaluate a command function shape over a time range, producing arrays
 * suitable for charting. The math mirrors the corresponding Chrono
 * ChFunction implementations exactly.
 */
export function evaluateFunction(
  fn: CommandFunctionShape,
  duration: number,
  numPoints = 200,
): FunctionSamples {
  const dt = duration / Math.max(numPoints - 1, 1);
  const times: number[] = [];
  const values: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const t = i * dt;
    times.push(t);
    values.push(evalAt(fn, t));
  }
  return { times, values };
}

function evalAt(fn: CommandFunctionShape, t: number): number {
  switch (fn.shape) {
    case 'constant':
      return fn.value;

    case 'ramp':
      return fn.initialValue + fn.slope * t;

    case 'sine':
      return fn.offset + fn.amplitude * Math.sin(2 * Math.PI * fn.frequency * t + fn.phase);

    case 'piecewise-linear':
      return evalPiecewiseLinear(fn.times, fn.values, t);

    case 'smooth-step':
      return fn.profile === 'cycloidal'
        ? evalCycloidal(fn.displacement, fn.duration, t)
        : evalConstAcc(fn.displacement, fn.accelFraction, fn.decelFraction, fn.duration, t);
  }
}

function evalPiecewiseLinear(times: number[], values: number[], t: number): number {
  if (times.length === 0) return 0;
  if (times.length === 1) return values[0];
  if (t <= times[0]) {
    // Extrapolate left
    const slope = (values[1] - values[0]) / (times[1] - times[0]);
    return values[0] + slope * (t - times[0]);
  }
  if (t >= times[times.length - 1]) {
    // Extrapolate right
    const n = times.length;
    const slope = (values[n - 1] - values[n - 2]) / (times[n - 1] - times[n - 2]);
    return values[n - 1] + slope * (t - times[n - 1]);
  }
  // Binary search for segment
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const frac = (t - times[lo]) / (times[hi] - times[lo]);
  return values[lo] + frac * (values[hi] - values[lo]);
}

/** Matches ChFunctionCycloidal::GetVal */
function evalCycloidal(h: number, w: number, t: number): number {
  if (w <= 0) return 0;
  if (t <= 0) return 0;
  if (t >= w) return h;
  const x = t / w;
  return h * (x - Math.sin(2 * Math.PI * x) / (2 * Math.PI));
}

/** Matches ChFunctionConstAcc::GetVal — 3-phase trapezoidal motion profile */
function evalConstAcc(
  displacement: number,
  accelFraction: number,
  decelFraction: number,
  duration: number,
  t: number,
): number {
  if (duration <= 0) return 0;
  if (t <= 0) return 0;
  if (t >= duration) return displacement;

  const h = displacement;
  const T = duration;
  const ta = accelFraction * T; // end of accel phase
  const td = (1 - decelFraction) * T; // start of decel phase

  // Compute velocity during constant phase from area balance:
  // h = 0.5*v*ta + v*(td-ta) + 0.5*v*(T-td)
  // h = v * (0.5*ta + td - ta + 0.5*T - 0.5*td)
  // h = v * (T - 0.5*ta - 0.5*(T-td))
  // h = v * (T - 0.5*ta - 0.5*T + 0.5*td)
  const denom = T - 0.5 * ta - 0.5 * (T - td);
  if (Math.abs(denom) < 1e-12) return 0;
  const v = h / denom;

  if (t < ta) {
    // Accel phase (parabolic)
    const a = v / ta;
    return 0.5 * a * t * t;
  } else if (t < td) {
    // Constant velocity phase
    const s_accel = 0.5 * v * ta;
    return s_accel + v * (t - ta);
  } else {
    // Decel phase (parabolic)
    const s_accel = 0.5 * v * ta;
    const s_const = v * (td - ta);
    const dt_decel = t - td;
    const T_decel = T - td;
    const a = v / T_decel;
    return s_accel + s_const + v * dt_decel - 0.5 * a * dt_decel * dt_decel;
  }
}
