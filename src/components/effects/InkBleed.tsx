/**
 * InkBleed — Threshold-based Ink Diffusion overlay
 *
 * Takes a source canvas (e.g. PretextTypography) as input,
 * runs WebGL2 ping-pong diffusion with FBM noise threshold.
 * Mounts as a full-size overlay canvas on top of the source.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ── Shader sources ──────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos; out vec2 vUv;
void main(){ vUv=a_pos*0.5+0.5; gl_Position=vec4(a_pos,0,1); }`;

const SPREAD_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D u_prev;
uniform sampler2D u_source;
uniform vec2 u_res;
uniform float u_spread;
uniform float u_noiseScale;
uniform float u_roughness;
uniform float u_feed;
uniform float u_time;

vec3 mod289(vec3 x){return x-floor(x/289.0)*289.0;}
vec2 mod289(vec2 x){return x-floor(x/289.0)*289.0;}
vec3 permute(vec3 x){return mod289((x*34.0+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)),x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1,0):vec2(0,1);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m;m=m*m;
  vec3 x3=2.0*fract(p*C.www)-1.0,h=abs(x3)-0.5,a0=x3-floor(x3+0.5);
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float hash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * snoise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 texel = 1.0 / u_res;
  float t = u_time * 0.1;
  float prevInk = 1.0 - texture(u_prev, vUv).r;

  float avgInk = prevInk;
  float maxInk = prevInk;
  float cnt = 1.0;

  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 6.28318 / 12.0;
    vec2 dir = vec2(cos(angle), sin(angle));
    float nj = snoise(vUv * 15.0 + dir * 4.0 + t);
    dir += vec2(nj) * u_roughness;
    float reach = (0.5 + hash(vUv * 25.0 + dir) * 0.5) * u_spread;
    float s = 1.0 - texture(u_prev, vUv + dir * texel * reach).r;
    maxInk = max(maxInk, s);
    avgInk += s;
    cnt += 1.0;
  }
  avgInk /= cnt;

  // Time-based screen fill: start watercolor, gradually aggressive
  float age = min(u_time / 15.0, 1.0);
  float maxBlend = 0.08 + age * 0.25;
  float rawInk = mix(avgInk, maxInk, maxBlend);
  rawInk *= 0.997;

  float source = 1.0 - texture(u_source, vUv).r;
  rawInk = max(rawInk, source * u_feed);
  rawInk = max(rawInk, source * 0.85);

  float ns = u_noiseScale;
  float paper = fbm(vUv * ns * 6.0 + 5.0);
  paper = paper * 0.5 + 0.5;

  float threshold = 1.0 - rawInk;
  float softness = 0.08 + u_roughness * 0.05;
  float ink = smoothstep(threshold - softness, threshold + softness, paper);
  ink = max(ink, source * 0.85);

  float result = 1.0 - ink;
  fragColor = vec4(vec3(result), 1.0);
}`;

const SOFTEN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D u_tex;
uniform sampler2D u_source;
uniform vec2 u_res;
uniform float u_spread;

void main(){
  vec2 texel = 1.0 / u_res;
  float blur = u_spread * 0.4;

  float sum = 0.0;
  float wt = 0.0;
  for (float dy = -1.0; dy <= 1.0; dy += 1.0) {
    for (float dx = -1.0; dx <= 1.0; dx += 1.0) {
      float w = exp(-(dx*dx + dy*dy) * 0.5);
      sum += texture(u_tex, vUv + vec2(dx, dy) * texel * blur).r * w;
      wt += w;
    }
  }
  float ink = sum / wt;
  float source = 1.0 - texture(u_source, vUv).r;
  ink = min(ink, 1.0 - source * 0.85);
  fragColor = vec4(vec3(ink), 1.0);
}`;

const COPY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D u_tex;
void main(){ fragColor = texture(u_tex, vUv); }`;

// ── WebGL helpers ───────────────────────────────────────────

function mkShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(sh));
  return sh;
}

function mkProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, mkShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mkShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return p;
}

// ── Component ───────────────────────────────────────────────

type Props = {
  /** The source 2D canvas to use as ink source */
  sourceCanvas: HTMLCanvasElement;
  /** Called when user stops the effect */
  onStop: () => void;
  /** Called once when the roughness ramp reaches 1.0 (scene 4 end trigger) */
  onRampComplete?: () => void;
  /** Hide the dev tuning panel (for exhibit mode) */
  hideTuning?: boolean;
};

/**
 * Ink bleed parameters.
 * - roughness is the RAMP TARGET — the shader value is interpolated
 *   from 0 → roughness over rampMs using smoothstep easing.
 */
const DEFAULTS = { spread: 0.5, noiseScale: 40, roughness: 5.0, feed: 0.07, rampMs: 20500 };

export function InkBleed({ sourceCanvas, onStop, onRampComplete, hideTuning = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const paramsRef = useRef({ ...DEFAULTS });
  const [params, setParams] = useState({ ...DEFAULTS });
  const seedRef = useRef<(() => void) | null>(null);
  const rampStartRef = useRef<number>(0);
  const rampCompleteFiredRef = useRef<boolean>(false);
  const onRampCompleteRef = useRef(onRampComplete);
  onRampCompleteRef.current = onRampComplete;

  const updateParam = useCallback(<K extends keyof typeof DEFAULTS>(key: K, val: number) => {
    paramsRef.current[key] = val;
    setParams(prev => ({ ...prev, [key]: val }));
  }, []);

  const start = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.width = sourceCanvas.width;
    const H = canvas.height = sourceCanvas.height;

    const gl = canvas.getContext('webgl2');
    if (!gl) { alert('WebGL 2 required'); return; }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Quad buffer
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

    function drawQuad(p: WebGLProgram) {
      gl!.useProgram(p);
      const l = gl!.getAttribLocation(p, 'a_pos');
      gl!.bindBuffer(gl!.ARRAY_BUFFER, qb);
      gl!.enableVertexAttribArray(l);
      gl!.vertexAttribPointer(l, 2, gl!.FLOAT, false, 0, 0);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    const U = (p: WebGLProgram, n: string) => gl!.getUniformLocation(p, n);

    const spreadProg = mkProgram(gl, VERT, SPREAD_FRAG);
    const softenProg = mkProgram(gl, VERT, SOFTEN_FRAG);
    const copyProg = mkProgram(gl, VERT, COPY_FRAG);

    // FBOs
    function createFBO() {
      const tex = gl!.createTexture()!;
      gl!.bindTexture(gl!.TEXTURE_2D, tex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, W, H, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      const fbo = gl!.createFramebuffer()!;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
      return { fbo, tex };
    }

    const fbos = [createFBO(), createFBO(), createFBO()];

    // Upload source canvas as texture
    const sourceTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Seed FBOs with source
    for (let i = 0; i < 3; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[i].fbo);
      gl.viewport(0, 0, W, H);
      gl.useProgram(copyProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTex);
      gl.uniform1i(U(copyProg, 'u_tex'), 0);
      drawQuad(copyProg);
    }

    let pp = 0;
    const t0 = performance.now();
    rampStartRef.current = t0;
    rampCompleteFiredRef.current = false;

    // Expose seed/reset — also restarts the roughness ramp
    seedRef.current = () => {
      for (let i = 0; i < 3; i++) {
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbos[i].fbo);
        gl!.viewport(0, 0, W, H);
        gl!.useProgram(copyProg);
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, sourceTex);
        gl!.uniform1i(U(copyProg, 'u_tex'), 0);
        drawQuad(copyProg);
      }
      rampStartRef.current = performance.now();
      rampCompleteFiredRef.current = false;
    };

    function render() {
      const now = performance.now();
      const time = (now - t0) * 0.001;
      const P = paramsRef.current;
      const read = pp, write = 1 - pp;

      // Roughness ramp: smoothstep 0 → 1 over rampMs, scaled to target
      const rampRaw = Math.max(0, Math.min(1, (now - rampStartRef.current) / Math.max(1, P.rampMs)));
      const rampT = rampRaw * rampRaw * (3 - 2 * rampRaw);
      const activeRoughness = P.roughness * rampT;

      // Fire onRampComplete once when ramp finishes
      if (rampRaw >= 1 && !rampCompleteFiredRef.current) {
        rampCompleteFiredRef.current = true;
        onRampCompleteRef.current?.();
      }

      // Pass 1: Spread
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbos[2].fbo);
      gl!.viewport(0, 0, W, H);
      gl!.useProgram(spreadProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, fbos[read].tex);
      gl!.uniform1i(U(spreadProg, 'u_prev'), 0);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, sourceTex);
      gl!.uniform1i(U(spreadProg, 'u_source'), 1);
      gl!.uniform2f(U(spreadProg, 'u_res'), W, H);
      gl!.uniform1f(U(spreadProg, 'u_spread'), P.spread);
      gl!.uniform1f(U(spreadProg, 'u_noiseScale'), P.noiseScale);
      gl!.uniform1f(U(spreadProg, 'u_roughness'), activeRoughness);
      gl!.uniform1f(U(spreadProg, 'u_feed'), P.feed);
      gl!.uniform1f(U(spreadProg, 'u_time'), time);
      drawQuad(spreadProg);

      // Pass 2: Soften
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbos[write].fbo);
      gl!.viewport(0, 0, W, H);
      gl!.useProgram(softenProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, fbos[2].tex);
      gl!.uniform1i(U(softenProg, 'u_tex'), 0);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, sourceTex);
      gl!.uniform1i(U(softenProg, 'u_source'), 1);
      gl!.uniform2f(U(softenProg, 'u_res'), W, H);
      gl!.uniform1f(U(softenProg, 'u_spread'), P.spread);
      drawQuad(softenProg);

      // Display
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, W, H);
      gl!.useProgram(copyProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, fbos[write].tex);
      gl!.uniform1i(U(copyProg, 'u_tex'), 0);
      drawQuad(copyProg);

      pp = write;
      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);
  }, [sourceCanvas]);

  // Start on mount
  useEffect(() => {
    start();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [start]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 10,
        }}
      />
      {/* Tuning panel */}
      {!hideTuning && <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid #333',
        padding: 14,
        width: 200,
        color: '#ccc',
        fontFamily: "'Courier New', monospace",
        fontSize: 11,
        borderRadius: 4,
      }}>
        <div style={{ color: '#e8a030', fontWeight: 'bold', fontSize: 12, marginBottom: 10 }}>
          INK BLEED
        </div>
        {([
          { key: 'spread' as const, label: 'spread', min: 0.5, max: 25, step: 0.1 },
          { key: 'noiseScale' as const, label: 'noise scale', min: 0.5, max: 40, step: 0.5 },
          { key: 'roughness' as const, label: 'roughness (target)', min: 0, max: 5, step: 0.05 },
          { key: 'feed' as const, label: 'feed', min: 0, max: 0.3, step: 0.005 },
          { key: 'rampMs' as const, label: 'ramp (ms)', min: 1000, max: 60000, step: 500 },
        ] as const).map(({ key, label, min, max, step }) => (
          <div key={key} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span>{label}</span>
              <span style={{ color: '#888' }}>{params[key]}</span>
            </div>
            <input
              type="range"
              min={min} max={max} step={step}
              value={params[key]}
              onChange={e => updateParam(key, parseFloat(e.target.value))}
              style={{
                width: '100%',
                WebkitAppearance: 'none',
                appearance: 'none',
                background: '#222',
                height: 3,
                borderRadius: 2,
                outline: 'none',
              }}
            />
          </div>
        ))}
        <button
          onClick={() => seedRef.current?.()}
          style={{
            width: '100%',
            padding: 5,
            marginTop: 2,
            background: '#222',
            color: '#ccc',
            border: '1px solid #444',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            borderRadius: 3,
          }}
        >
          ink reset
        </button>
        <button
          onClick={onStop}
          style={{
            width: '100%',
            padding: 5,
            marginTop: 4,
            background: '#222',
            color: '#ccc',
            border: '1px solid #444',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            borderRadius: 3,
          }}
        >
          stop
        </button>
      </div>}
    </>
  );
}
