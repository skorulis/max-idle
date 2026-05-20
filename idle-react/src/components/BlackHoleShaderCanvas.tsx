import { useEffect, useRef, type MutableRefObject } from "react";

const TAP_BOOST_DECAY_PER_SECOND = 0.5;

const VS_SOURCE = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FS_SOURCE = `
  precision mediump float;
  uniform float t;
  uniform vec2 r;  // resolution
  uniform float u_brightness;

  // Custom tanh function for vec2 since built-in tanh is unavailable in WebGL GLSL.
  vec2 myTanh(vec2 x) {
    vec2 ex = exp(x);
    vec2 emx = exp(-x);
    return (ex - emx) / (ex + emx);
  }

  void main() {
    vec4 o_bg = vec4(0.0);
    vec4 o_anim = vec4(0.0);
    float brightness = u_brightness;
    float brightness_inverse = 1.0 / brightness;
    float spread = 0.2;

    // ---------------------------
    // Foreground (Animation) Layer
    // ---------------------------
    {
      vec2 p_anim = (gl_FragCoord.xy * 2.0 - r) / r.y / 0.9;
      vec2 d = vec2(-1.0, 1.1);
      float denom = spread + 5.0 / dot(5.0 * p_anim - d, 5.0 * p_anim - d);
      vec2 c = p_anim * mat2(1.0, 1.0, d.x / denom, d.y / denom);
      vec2 v = c;
      // Apply a time-varying transformation:
      v *= mat2(cos(log(length(v)) + t * 0.2 + vec4(0.0, 33.0, 11.0, 0.0))) * 5.0;
      vec4 animAccum = vec4(0.0);
      for (int i = 1; i <= 9; i++) {
        float fi = float(i);
        animAccum += sin(vec4(v.x, v.y, v.y, v.x)) + vec4(1.0);
        v += 0.7 * sin(vec2(v.y, v.x) * fi + t) / fi + 0.5;
      }
      vec4 animTerm = 1.0 - exp(-exp(c.x * vec4(0.6, -0.4, -1.0, 0.0))
                        / animAccum
                        / (0.1 + 0.1 * pow(length(sin(v / 0.3) * 0.2 + c * vec2(1.0, 2.0)) - 1.0, 2.0))
                        / (1.0 + 7.0 * exp(0.3 * c.y - dot(c, c)))
                        / (brightness_inverse + abs(length(p_anim) - 0.7)) * 0.2);
      o_anim += animTerm;
    }

    // ---------------------------
    // Blend Layers: animation at 50% opacity over image.
    // Boost brightness so output isn't pitch black.
    // ---------------------------
    vec4 finalColor = mix(o_bg, o_anim, 0.5) * 1.5;
    finalColor = clamp(finalColor, 0.0, 1.0);
    gl_FragColor = finalColor;
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vertexShader || !fragmentShader) {
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program failed to link:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

export type BlackHoleShaderCanvasProps = {
  className?: string;
  /** Blackhole time in seconds; base brightness is this / 3600. */
  blackholeTime: number;
  /** 0–1 tap impulse; canvas decays this each frame and adds on top of base brightness. */
  tapBoostRef: MutableRefObject<number>;
};

export function BlackHoleShaderCanvas({ className, blackholeTime, tapBoostRef }: BlackHoleShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blackholeTimeRef = useRef(blackholeTime);

  useEffect(() => {
    blackholeTimeRef.current = blackholeTime;
  }, [blackholeTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const container = canvas.parentElement;
    if (!container) {
      return;
    }

    const gl = canvas.getContext("webgl");
    if (!gl) {
      return;
    }

    const program = createProgram(gl, VS_SOURCE, FS_SOURCE);
    if (!program) {
      return;
    }

    gl.useProgram(program);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const timeLocation = gl.getUniformLocation(program, "t");
    const resolutionLocation = gl.getUniformLocation(program, "r");
    const brightnessLocation = gl.getUniformLocation(program, "u_brightness");

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buffer = gl.createBuffer();
    if (!buffer) {
      gl.deleteProgram(program);
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrameId = 0;
    const startTime = performance.now();
    let lastFrameTime = startTime;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(container.clientWidth * dpr);
      const height = Math.floor(container.clientHeight * dpr);
      if (width <= 0 || height <= 0) {
        return;
      }
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(container);
    resize();

    const render = (now: number) => {
      const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;

      if (tapBoostRef.current > 0) {
        tapBoostRef.current = Math.max(0, tapBoostRef.current - TAP_BOOST_DECAY_PER_SECOND * dt);
      }

      const elapsed = reducedMotionQuery.matches ? 0 : (now - startTime) / 1000;
      const brightness = 2 + blackholeTimeRef.current / 3600 + tapBoostRef.current * 6;
      gl.uniform1f(timeLocation, elapsed);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(brightnessLocation, brightness);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrameId = requestAnimationFrame(render);
    };
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [tapBoostRef]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
