"use client";

import * as React from "react";

export type PolicyPhotoMorphHandle = {
  /** Position along the photo list: 0 shows the first photo, 1.5 is halfway between the second and third. */
  setPosition: (position: number) => void;
};

type PolicyPhotoMorphProps = {
  photos: string[];
  className?: string;
  /** Called once every photo is uploaded to the GPU, or with false when WebGL is unavailable. */
  onReadyChange?: (ready: boolean) => void;
};

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// A rippled-glass change: a noise-shaped front sweeps up the frame while both photos are pulled
// hard along the same flow field, so mid-change they smear into fluted, refracted streaks before
// the incoming photo settles sharp. The outgoing one stretches away; the incoming one settles in.
const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec2 uFromCover;
uniform vec2 uToCover;
uniform float uMix;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}
vec2 cover(vec2 uv, vec2 scale) { return (uv - 0.5) * scale + 0.5; }

void main() {
  vec2 uv = vUv;
  float flow = fbm(uv * vec2(2.2, 3.4));
  float t = uMix;

  // Where the front has reached: 0 still shows the old photo, 1 shows the new one.
  float front = uv.y * 0.62 + flow * 0.38;
  float sweep = t * 1.5 - 0.25;
  float reveal = 1.0 - smoothstep(sweep - 0.14, sweep + 0.14, front);

  // Distortion peaks mid-transition and vanishes at both ends, so still frames are untouched.
  float strength = sin(t * 3.14159265);
  vec2 drift = vec2(flow - 0.5, 0.9) * 0.16 * strength;

  vec2 fromUv = cover(uv + drift * t, uFromCover * (1.0 - 0.06 * t));
  vec2 toUv = cover(uv - drift * (1.0 - t), uToCover * (0.94 + 0.06 * t));

  vec4 fromColor = texture2D(uFrom, clamp(fromUv, 0.0, 1.0));
  vec4 toColor = texture2D(uTo, clamp(toUv, 0.0, 1.0));

  // A faint highlight rides the front, like light catching the edge of a wave.
  float edge = smoothstep(0.0, 0.5, reveal) * (1.0 - smoothstep(0.5, 1.0, reveal));
  vec4 color = mix(fromColor, toColor, reveal);
  color.rgb += edge * strength * 0.08;
  gl_FragColor = vec4(color.rgb, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

// Between photos only the middle of each step is spent morphing; either side the photo holds still.
function stepMix(fraction: number) {
  const t = Math.min(1, Math.max(0, (fraction - 0.2) / 0.6));
  return t * t * (3 - 2 * t);
}

export const PolicyPhotoMorph = React.forwardRef<PolicyPhotoMorphHandle, PolicyPhotoMorphProps>(function PolicyPhotoMorph({ photos, className, onReadyChange }, ref) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const positionRef = React.useRef(0);
  const drawRef = React.useRef<() => void>(() => undefined);
  const readyChangeRef = React.useRef(onReadyChange);
  readyChangeRef.current = onReadyChange;

  // Scroll updates already arrive inside an animation frame, so draw straight away rather than a frame late.
  React.useImperativeHandle(ref, () => ({
    setPosition(position: number) {
      if (position === positionRef.current) return;
      positionRef.current = position;
      drawRef.current();
    },
  }), []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!canvas || !gl) {
      readyChangeRef.current?.(false);
      return;
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      readyChangeRef.current?.(false);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      readyChangeRef.current?.(false);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      from: gl.getUniformLocation(program, "uFrom"),
      to: gl.getUniformLocation(program, "uTo"),
      fromCover: gl.getUniformLocation(program, "uFromCover"),
      toCover: gl.getUniformLocation(program, "uToCover"),
      mix: gl.getUniformLocation(program, "uMix"),
    };
    gl.uniform1i(uniforms.from, 0);
    gl.uniform1i(uniforms.to, 1);

    let textures: { texture: WebGLTexture; aspect: number }[] = [];
    let disposed = false;

    // Scale UVs so each photo fills the frame like object-fit: cover.
    function coverScale(imageAspect: number) {
      const frameAspect = canvas!.width / Math.max(1, canvas!.height);
      return frameAspect > imageAspect ? [1, imageAspect / frameAspect] : [frameAspect / imageAspect, 1];
    }

    function draw() {
      if (disposed || textures.length !== photos.length) return;
      const last = photos.length - 1;
      const position = Math.min(last, Math.max(0, positionRef.current));
      const index = Math.min(last - 1, Math.floor(position));
      const from = textures[Math.max(0, index)];
      const to = textures[Math.min(last, index + 1)];
      const mixValue = position >= last ? 1 : stepMix(position - index);

      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, from.texture);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, to.texture);
      gl!.uniform2fv(uniforms.fromCover, coverScale(from.aspect));
      gl!.uniform2fv(uniforms.toCover, coverScale(to.aspect));
      gl!.uniform1f(uniforms.mix, mixValue);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }
    drawRef.current = draw;

    const resize = new ResizeObserver(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      draw();
    });
    resize.observe(canvas);

    Promise.all(photos.map(loadImage)).then((images) => {
      if (disposed) return;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      textures = images.map((image) => {
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        return { texture, aspect: image.naturalWidth / image.naturalHeight };
      });
      draw();
      readyChangeRef.current?.(true);
    }).catch(() => {
      if (!disposed) readyChangeRef.current?.(false);
    });

    return () => {
      disposed = true;
      resize.disconnect();
      drawRef.current = () => undefined;
      textures.forEach(({ texture }) => gl.deleteTexture(texture));
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [photos]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
});
