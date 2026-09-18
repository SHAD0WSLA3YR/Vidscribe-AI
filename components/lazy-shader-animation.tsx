'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import shader with no SSR
const ShaderAnimation = dynamic(
  () =>
    import('@/components/shader-animation').then((mod) => ({
      default: mod.ShaderAnimation,
    })),
  {
    ssr: false,
  }
);

interface LazyShaderAnimationProps {
  zoom?: number;
  className?: string;
}

export function LazyShaderAnimation({
  zoom,
  className,
}: LazyShaderAnimationProps) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Load immediately when this component is rendered (meaning it's actually needed)
    setShouldLoad(true);
  }, []);

  // Don't load on low-end devices
  useEffect(() => {
    const isLowEnd =
      navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
    if (isLowEnd) {
      setShouldLoad(false);
    }
  }, []);

  if (!shouldLoad) {
    // Fallback animation using CSS
    return (
      <div
        className={`${className} animate-pulse bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900`}
      />
    );
  }

  return <ShaderAnimation zoom={zoom} className={className} />;
}
