"use client"

import { useEffect, useRef } from "react"
import { Mesh, Program, Renderer, Triangle } from "ogl"

type PlasmaRoomBackgroundProps = {
  /** Accent tint (React Bits plasma; gold works on dark UI). */
  color?: string
  speed?: number
  opacity?: number
  scale?: number
}

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) {
    return [0.83, 0.69, 0.22]
  }
  return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255]
}

const vertex = `#version 300 es
precision highp float;
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uCustomColor;
uniform float uUseCustomColor;
uniform float uSpeed;
uniform float uDirection;
uniform float uScale;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseInteractive;
out vec4 fragColor;

void mainImage(out vec4 o, vec2 C) {
  vec2 center = iResolution.xy * 0.5;
  C = (C - center) / uScale + center;

  vec2 mouseOffset = (uMouse - center) * 0.0002;
  C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);

  float i, d, z, T = iTime * uSpeed * uDirection;
  vec3 O, p, S;

  for (vec2 r = iResolution.xy, Q; ++i < 60.; O += o.w / d * o.xyz) {
    p = z * normalize(vec3(C - 0.5 * r, r.y));
    p.z -= 4.;
    S = p;
    d = p.y - T;

    p.x += 0.4 * (1.0 + p.y) * sin(d + p.x * 0.1) * cos(0.34 * d + p.x * 0.05);
    Q = p.xz *= mat2(cos(p.y + vec4(0, 11, 33, 0) - T));
    z += d = abs(sqrt(length(Q * Q)) - 0.25 * (5.0 + S.y)) / 3.0 + 8e-4;
    o = 1.0 + sin(S.y + p.z * 0.5 + S.z - length(S - p) + vec4(2, 1, 0, 8));
  }

  o.xyz = tanh(O / 1e4);
}

bool finite1(float x) {
  return !(isnan(x) || isinf(x));
}
vec3 sanitize(vec3 c) {
  return vec3(
    finite1(c.r) ? c.r : 0.0,
    finite1(c.g) ? c.g : 0.0,
    finite1(c.b) ? c.b : 0.0
  );
}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  vec3 rgb = sanitize(o.rgb);

  float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;
  vec3 customColor = intensity * uCustomColor;
  vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));

  float alpha = length(rgb) * uOpacity;
  fragColor = vec4(finalColor, alpha);
}
`

function capDpr(): number {
  const raw = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
  const narrow = typeof window !== "undefined" && window.innerWidth < 900
  return Math.min(raw, narrow ? 1.15 : 1.75)
}

/**
 * Plasma shader background (DavidHDev / React Bits style, WebGL2 + ogl).
 * Pauses when tab hidden; respects prefers-reduced-motion.
 */
export default function PlasmaRoomBackground({
  color = "#d4af37",
  speed = 0.85,
  opacity = 0.42,
  scale = 1.05,
}: PlasmaRoomBackgroundProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof window === "undefined") {
      return
    }

    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      root.style.background =
        "radial-gradient(120% 80% at 50% 20%, color-mix(in srgb, #d4af37 22%, #1a1510) 0%, #12100e 55%)"
      return
    }

    const useCustomColor = 1.0
    const customColorRgb = hexToRgb(color)
    const directionMultiplier = 1.0

    let renderer: Renderer
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        antialias: false,
        dpr: capDpr(),
      })
    } catch {
      root.style.background = "radial-gradient(ellipse at 50% 0%, #2a2418 0%, #12100e 70%)"
      return
    }

    const gl = renderer.gl
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.display = "block"
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    root.appendChild(canvas)

    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uCustomColor: { value: new Float32Array(customColorRgb) },
        uUseCustomColor: { value: useCustomColor },
        uSpeed: { value: speed * 0.4 },
        uDirection: { value: directionMultiplier },
        uScale: { value: scale },
        uOpacity: { value: opacity },
        uMouse: { value: new Float32Array([0, 0]) },
        uMouseInteractive: { value: 0 },
      },
    })

    const mesh = new Mesh(gl, { geometry, program })

    const setSize = () => {
      const rect = root.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      renderer.dpr = capDpr()
      renderer.setSize(width, height)
      const res = program.uniforms.iResolution.value as Float32Array
      res[0] = gl.drawingBufferWidth
      res[1] = gl.drawingBufferHeight
    }

    const ro = new ResizeObserver(setSize)
    ro.observe(root)
    setSize()

    let raf = 0
    const t0 = performance.now()
    let hidden = document.visibilityState === "hidden"

    const onVisibility = () => {
      hidden = document.visibilityState === "hidden"
      if (!hidden && raf === 0) {
        raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    const loop = (t: number) => {
      if (hidden) {
        raf = 0
        return
      }
      const timeValue = (t - t0) * 0.001
      ;(program.uniforms.iTime as { value: number }).value = timeValue
      renderer.render({ scene: mesh })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      cancelAnimationFrame(raf)
      ro.disconnect()
      try {
        root.removeChild(canvas)
      } catch {
        /* already removed */
      }
      try {
        const ext = gl.getExtension("WEBGL_lose_context")
        ext?.loseContext()
      } catch {
        /* noop */
      }
    }
  }, [color, opacity, scale, speed])

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
      }}
      aria-hidden
    />
  )
}
