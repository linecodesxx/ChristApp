"use client"

import { useEffect, useRef, useState } from "react"
import { Mesh, Program, Renderer, Triangle } from "ogl"

type PlasmaRoomBackgroundProps = {
  density?: number
  speed?: number
  rotationSpeed?: number
  brightness?: number
  fullScreenDesktop?: boolean
  mobileBreakpoint?: number
}

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uDensity;
uniform float uSpeed;
uniform float uRotationSpeed;
uniform float uBrightness;

varying vec2 vUv;

#define NUM_LAYER 2.0
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float Star(vec2 uv, float flare) {
  float d = max(length(uv), 0.001);
  float m = 0.015 / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 850.0));
  m += rays * flare * 0.12;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 850.0));
  m += rays * flare * 0.05;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 cell = id + offset;
      float seed = Hash21(cell);
      float size = fract(seed * 345.32);
      float flare = smoothstep(0.92, 1.0, size);
      vec2 drift = vec2(
        sin(uTime * (0.08 + seed * 0.06) + seed * 6.2831),
        cos(uTime * (0.06 + seed * 0.05) + seed * 4.7123)
      ) * 0.12;

      float star = Star(gv - offset - drift, flare);
      vec3 color = mix(vec3(0.58, 0.67, 0.98), vec3(0.95, 0.97, 1.0), seed);
      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 uv = (vUv * uResolution - 0.5 * uResolution) / uResolution.y;
  float angle = uTime * uRotationSpeed;
  mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  uv = rot * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uTime * (0.02 * uSpeed));
    float scale = mix(8.0 * uDensity, 0.9 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.82, depth);
    col += StarLayer(uv * scale + i * 271.13) * fade;
  }

  vec3 darkBase = vec3(0.01, 0.012, 0.025);
  gl_FragColor = vec4(darkBase + col * uBrightness, 1.0);
}
`

const RENDER_SCALE = 0.6
const TARGET_FRAME_MS = 1000 / 30

export default function PlasmaRoomBackground({
  density = 1,
  speed = 1,
  rotationSpeed = 0.035,
  brightness = 0.72,
  fullScreenDesktop = true,
  mobileBreakpoint = 1023,
}: PlasmaRoomBackgroundProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const mediaQuery = window.matchMedia(`(max-width: ${mobileBreakpoint}px)`)
    const apply = () => setIsMobile(mediaQuery.matches)
    apply()

    mediaQuery.addEventListener("change", apply)
    return () => {
      mediaQuery.removeEventListener("change", apply)
    }
  }, [mobileBreakpoint])

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof window === "undefined") {
      return
    }

    const reducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reducedMotion) {
      root.style.background = "radial-gradient(120% 85% at 50% 20%, #17182a 0%, #09080f 58%, #050509 100%)"
      return
    }

    let renderer: Renderer
    try {
      renderer = new Renderer({
        alpha: false,
        antialias: false,
        dpr: 1,
        premultipliedAlpha: false,
      })
    } catch {
      root.style.background = "radial-gradient(120% 85% at 50% 20%, #17182a 0%, #09080f 58%, #050509 100%)"
      return
    }

    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 1)

    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.display = "block"
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    root.appendChild(canvas)

    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Float32Array([1, 1]) },
        uDensity: { value: density },
        uSpeed: { value: speed },
        uRotationSpeed: { value: rotationSpeed },
        uBrightness: { value: brightness },
      },
    })

    const mesh = new Mesh(gl, { geometry, program })

    const setSize = () => {
      const useViewport = fullScreenDesktop && !isMobile
      const widthSource = useViewport ? window.innerWidth : root.getBoundingClientRect().width
      const heightSource = useViewport ? window.innerHeight : root.getBoundingClientRect().height
      const width = Math.max(1, Math.floor(widthSource * RENDER_SCALE))
      const height = Math.max(1, Math.floor(heightSource * RENDER_SCALE))
      renderer.setSize(width, height)

      const resolution = program.uniforms.uResolution.value as Float32Array
      resolution[0] = gl.canvas.width
      resolution[1] = gl.canvas.height
    }

    const resizeObserver = new ResizeObserver(setSize)
    resizeObserver.observe(root)
    setSize()

    let raf = 0
    let lastFrameTime = 0
    let hidden = document.visibilityState === "hidden"

    const onVisibilityChange = () => {
      hidden = document.visibilityState === "hidden"
      if (!hidden && raf === 0) {
        raf = requestAnimationFrame(loop)
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)

    const loop = (time: number) => {
      if (hidden) {
        raf = 0
        return
      }

      if (time - lastFrameTime >= TARGET_FRAME_MS) {
        lastFrameTime = time
        ;(program.uniforms.uTime as { value: number }).value = time * 0.001
        renderer.render({ scene: mesh })
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
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
  }, [brightness, density, fullScreenDesktop, isMobile, rotationSpeed, speed])

  const useViewport = fullScreenDesktop && !isMobile

  return (
    <div
      ref={rootRef}
      style={{
        position: useViewport ? "fixed" : "absolute",
        inset: 0,
        width: useViewport ? "100vw" : "100%",
        height: useViewport ? "100vh" : "100%",
        overflow: "hidden",
        pointerEvents: "none",
        background: "#09080f",
      }}
      aria-hidden
    />
  )
}
