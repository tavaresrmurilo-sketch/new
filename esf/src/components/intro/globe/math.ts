/** Álgebra mínima para a câmera (matrizes coluna-maior, como o WebGL espera). */

export type Vec3 = [number, number, number];

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  mix: (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dot: (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: Vec3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

export interface Camera {
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  /** campo de visão vertical, em graus */
  fov: number;
}

export interface CameraFrame {
  viewProj: Float32Array;
  eye: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  tanHalf: number;
  aspect: number;
  /** pixels por unidade de mundo a 1 unidade de distância */
  focalPx: number;
  near: number;
}

export function cameraFrame(cam: Camera, width: number, height: number): CameraFrame {
  const aspect = width / height;
  const near = 0.03;
  const far = 60;
  const f = v3.norm(v3.sub(cam.target, cam.eye));
  let r = v3.cross(f, cam.up);
  if (v3.len(r) < 1e-5) r = v3.cross(f, [0, 0, -1]);
  r = v3.norm(r);
  const u = v3.cross(r, f);
  const e = cam.eye;
  // view (coluna-maior)
  const view = [
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    -v3.dot(r, e), -v3.dot(u, e), v3.dot(f, e), 1,
  ];
  const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
  const sy = 1 / tanHalf;
  const sx = sy / aspect;
  const a = (far + near) / (near - far);
  const b = (2 * far * near) / (near - far);
  const proj = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, a, -1, 0, 0, b, 0];
  const vp = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += proj[k * 4 + row] * view[c * 4 + k];
      vp[c * 4 + row] = s;
    }
  return { viewProj: vp, eye: e, right: r, up: u, forward: f, tanHalf, aspect, focalPx: height / (2 * tanHalf), near };
}

/** Projeta um ponto do mundo em pixels CSS (y para baixo). `w` ≤ 0 indica ponto atrás da câmera. */
export function project(frame: CameraFrame, p: Vec3, width: number, height: number) {
  const m = frame.viewProj;
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  const iw = 1 / Math.max(w, 1e-4);
  return { x: (x * iw * 0.5 + 0.5) * width, y: (0.5 - y * iw * 0.5) * height, w };
}
