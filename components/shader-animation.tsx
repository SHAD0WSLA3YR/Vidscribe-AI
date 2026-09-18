'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';

interface ShaderAnimationProps {
  className?: string;
  zoom?: number;
}

interface SceneContext {
  renderer: THREE.WebGLRenderer;
  geometry: THREE.PlaneGeometry;
  material: THREE.ShaderMaterial;
  animationFrame: number;
}

type ShaderUniformMap = {
  [uniform: string]: THREE.IUniform<any>;
} & {
  time: THREE.IUniform<number>;
  resolution: THREE.IUniform<THREE.Vector2>;
  zoom: THREE.IUniform<number>;
};

export function ShaderAnimation({
  className,
  zoom = 0.55,
}: ShaderAnimationProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneContextRef = useRef<SceneContext | null>(null);
  const uniformsRef = useRef<ShaderUniformMap>({
    time: { value: 1.0 },
    resolution: { value: new THREE.Vector2() },
    zoom: { value: zoom },
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    uniformsRef.current.zoom.value = zoom;

    const camera = new THREE.Camera();
    camera.position.z = 1;

    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);

    const vertexShader = /* glsl */ `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      #define TWO_PI 6.2831853072
      #define PI 3.14159265359

      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float zoom;

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        uv *= zoom;
        float t = time * 0.05;
        float lineWidth = 0.002;

        vec3 color = vec3(0.0);
        for (int j = 0; j < 3; j++) {
          for (int i = 0; i < 5; i++) {
            color[j] += lineWidth * float(i * i) /
              abs(fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
          }
        }

        gl_FragColor = vec4(color[0], color[1], color[2], 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms: uniformsRef.current,
      vertexShader,
      fragmentShader,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.pointerEvents = 'none';

    container.appendChild(renderer.domElement);

    const handleResize = () => {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight, false);
      uniformsRef.current.resolution.value.set(
        renderer.domElement.width,
        renderer.domElement.height
      );
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const animate = () => {
      uniformsRef.current.time.value += 0.05;
      renderer.render(scene, camera);
      const id = requestAnimationFrame(animate);
      if (sceneContextRef.current) {
        sceneContextRef.current.animationFrame = id;
      }
    };

    sceneContextRef.current = {
      renderer,
      geometry,
      material,
      animationFrame: requestAnimationFrame(animate),
    };

    return () => {
      window.removeEventListener('resize', handleResize);
      const context = sceneContextRef.current;
      if (context) {
        cancelAnimationFrame(context.animationFrame);
        if (container.contains(context.renderer.domElement)) {
          container.removeChild(context.renderer.domElement);
        }
        context.renderer.dispose();
        context.geometry.dispose();
        context.material.dispose();
        sceneContextRef.current = null;
      }
    };
  }, [zoom]);

  return <div ref={containerRef} className={cn('h-full w-full', className)} />;
}
