import { useEffect, useRef, useState } from 'react';

// Toggle: set to false to disable the shader wallpaper
const SHADER_ENABLED = true;
const MOBILE_BREAKPOINT = 768;

const VERTEX_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAGMENT_SRC = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;
uniform float u_inside;
uniform float u_intensity;
uniform float u_flow;
uniform float u_warp;
uniform float u_palette;
uniform float u_grain;
uniform vec4  u_ripples[6];
uniform float u_now;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0; i<5; i++){ v += a*noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
float blob(vec2 uv, vec2 c, float r){
  float d = distance(uv, c);
  return smoothstep(r, 0.0, d);
}

vec3 paletteWarm(float t){
  vec3 yellow = vec3(1.000, 0.831, 0.000);
  vec3 cream  = vec3(0.984, 0.969, 0.937);
  vec3 sand   = vec3(0.953, 0.918, 0.847);
  vec3 c = mix(cream, sand, smoothstep(0.0, 0.55, t));
  c = mix(c, yellow, smoothstep(0.55, 1.0, t) * 0.55);
  return c;
}
vec3 paletteIvory(float t){
  vec3 a = vec3(0.984, 0.973, 0.945);
  vec3 b = vec3(0.929, 0.902, 0.835);
  return mix(a, b, t);
}
vec3 paletteDusk(float t){
  vec3 cream  = vec3(0.984, 0.969, 0.937);
  vec3 lilac  = vec3(0.812, 0.776, 0.949);
  vec3 mint   = vec3(0.776, 0.929, 0.831);
  vec3 sky    = vec3(0.769, 0.871, 0.961);
  vec3 c = cream;
  c = mix(c, lilac, smoothstep(0.30, 0.70, t) * 0.35);
  c = mix(c, mint,  smoothstep(0.55, 0.85, t) * 0.20);
  c = mix(c, sky,   smoothstep(0.70, 1.00, t) * 0.18);
  return c;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 puv = uv * asp;
  vec2 mp  = u_mouse * asp;

  float t = u_time * mix(0.04, 0.22, u_flow);

  vec2 q = puv * 1.6 + vec2(t*0.4, -t*0.3);
  float w1 = fbm(q);
  float w2 = fbm(q + vec2(3.7, 1.2) + w1);
  vec2 wuv = puv + (vec2(w1, w2) - 0.5) * (0.18 + 0.42 * u_warp);

  float md = distance(puv, mp);
  float mInf = exp(-md * 2.2) * u_inside;
  wuv += (mp - puv) * mInf * 0.06;

  vec2 c1 = vec2(0.30 + 0.20*sin(t*0.7), 0.35 + 0.18*cos(t*0.55)) * asp;
  vec2 c2 = vec2(1.10 + 0.18*cos(t*0.6), 0.75 + 0.22*sin(t*0.45));
  vec2 c3 = vec2(0.80 + 0.30*sin(t*0.4 + 1.5), 0.20 + 0.25*cos(t*0.3));

  float field = blob(wuv, c1, 0.70)*0.6
              + blob(wuv, c2, 0.65)*0.55
              + blob(wuv, c3, 0.55)*0.45
              + blob(wuv, mp, 0.55)*0.9*(0.5 + 0.5*u_inside);
  field += (fbm(wuv*2.0 + t*0.5) - 0.5) * 0.35;

  float ripple = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 R = u_ripples[i];
    if (R.w > 0.001) {
      float age = u_now - R.z;
      if (age >= 0.0 && age < 2.4) {
        vec2 rc = R.xy * asp;
        float d = distance(puv, rc);
        float radius = age * 0.55;
        float ring = exp(-pow((d - radius) * 7.0, 2.0));
        float life = 1.0 - smoothstep(0.0, 2.4, age);
        ripple += ring * life * R.w;
      }
    }
  }
  field += ripple * 0.9;

  float v = clamp(field * (0.55 + 0.85 * u_intensity), 0.0, 1.6);

  vec3 col;
  if (u_palette < 0.5)      col = paletteWarm(v);
  else if (u_palette < 1.5) col = paletteIvory(v);
  else                      col = paletteDusk(v);

  float vig = smoothstep(1.4, 0.2, length((uv - 0.5) * vec2(1.4, 1.0)));
  col *= mix(0.94, 1.0, vig);

  float halo = exp(-md * 5.0) * u_inside * 0.10 * u_intensity;
  col = mix(col, vec3(1.0, 0.92, 0.45), halo);
  col = mix(col, vec3(1.0, 0.94, 0.55), clamp(ripple * 0.25 * u_intensity, 0.0, 0.4));

  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * u_grain * 0.06;

  gl_FragColor = vec4(col, 1.0);
}
`;

const CONFIG = {
  intensity: 0,
  flow: 0.16,
  warp: 0,
  grain: 0.24,
  palette: 'ivory' as 'warm' | 'ivory' | 'dusk',
};

function paletteIdx(name: string): number {
  return name === 'dusk' ? 2 : name === 'warm' ? 0 : 1;
}

function compileShader(gl: WebGLRenderingContext, src: string, type: number): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

export function ShaderWallpaper() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= MOBILE_BREAKPOINT);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!SHADER_ENABLED || !isDesktop) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) return;

    const vs = compileShader(gl, VERTEX_SRC, gl.VERTEX_SHADER);
    const fs = compileShader(gl, FRAGMENT_SRC, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      res: U('u_res'), time: U('u_time'),
      mouse: U('u_mouse'), inside: U('u_inside'),
      intensity: U('u_intensity'), flow: U('u_flow'), warp: U('u_warp'),
      palette: U('u_palette'), grain: U('u_grain'),
      ripples: U('u_ripples'), now: U('u_now'),
    };

    const state = {
      mouse: [0.5, 0.5],
      target: [0.5, 0.5],
      inside: 0,
      ripples: [] as { x: number; y: number; t: number; strength: number }[],
    };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }
    resize();

    const onMove = (e: PointerEvent) => {
      state.target = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];
      state.inside = 1;
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      state.ripples.push({
        x: state.target[0], y: state.target[1],
        t: performance.now() / 1000, strength: 1,
      });
      if (state.ripples.length > 6) state.ripples.shift();
    };
    const onLeave = () => { state.inside = 0; };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerleave', onLeave);

    const ripBuf = new Float32Array(6 * 4);
    let rafId = 0;
    let paused = false;

    function frame(now: number) {
      if (paused) { rafId = requestAnimationFrame(frame); return; }
      const t = now / 1000;
      state.mouse[0] += (state.target[0] - state.mouse[0]) * 0.08;
      state.mouse[1] += (state.target[1] - state.mouse[1]) * 0.08;
      resize();
      gl!.uniform2f(u.res, canvas!.width, canvas!.height);
      gl!.uniform1f(u.time, t);
      gl!.uniform2f(u.mouse, state.mouse[0], state.mouse[1]);
      gl!.uniform1f(u.inside, state.inside);
      gl!.uniform1f(u.intensity, CONFIG.intensity);
      gl!.uniform1f(u.flow, CONFIG.flow);
      gl!.uniform1f(u.warp, CONFIG.warp);
      gl!.uniform1f(u.palette, paletteIdx(CONFIG.palette));
      gl!.uniform1f(u.grain, CONFIG.grain);
      gl!.uniform1f(u.now, t);
      ripBuf.fill(0);
      for (let i = 0; i < state.ripples.length && i < 6; i++) {
        const R = state.ripples[i];
        ripBuf[i * 4] = R.x;
        ripBuf[i * 4 + 1] = R.y;
        ripBuf[i * 4 + 2] = R.t;
        ripBuf[i * 4 + 3] = R.strength;
      }
      gl!.uniform4fv(u.ripples, ripBuf);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    const onVisibility = () => { paused = document.visibilityState === 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isDesktop]);

  if (!SHADER_ENABLED || !isDesktop) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full print:hidden"
        style={{ zIndex: 0 }}
      />
      {/* Optional paper-grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none print:hidden"
        style={{
          zIndex: 1,
          mixBlendMode: 'multiply',
          opacity: 0.035,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />
    </>
  );
}
