'use client';

import { useState } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
}

/* eslint-disable @next/next/no-img-element */
export default function LazyImage({ src, alt, className }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`lazy-image-wrapper ${className ?? ''}`}>
      {!loaded && <div className="image-skeleton" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        style={{ display: loaded ? 'block' : 'none' }}
      />
    </div>
  );
}

