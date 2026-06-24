import { useState, useRef, useEffect } from 'react';

interface Props {
  src?:             string | null;
  alt:              string;
  emoji:            string;
  color:            string;
  className?:       string;
  imgClassName?:    string;
  objectFit?:       'cover' | 'contain';
  objectPosition?:  string;
  style?:           React.CSSProperties;
}

/**
 * Robust poster image with skeleton loading, smooth reveal, and elegant fallback.
 * Never shows a broken image — always shows something meaningful.
 */
export function PosterImage({
  src,
  alt,
  emoji: _emoji,
  color,
  className = '',
  imgClassName = '',
  objectFit = 'cover',
  objectPosition = 'center top',
  style,
}: Props) {
  const [status, setStatus]   = useState<'loading' | 'loaded' | 'error'>('loading');
  const [visible, setVisible] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset when src changes
  useEffect(() => {
    if (!src) { setStatus('error'); return; }
    setStatus('loading');
    setVisible(false);
  }, [src]);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: '120px' },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const showSkeleton = !!src && status === 'loading' && visible;
  const showFallback = !src || status === 'error';

  return (
    <div
      ref={containerRef}
      className={`poster-img-wrap ${className}`}
      style={{ background: color, ...style }}
    >
      {/* Fallback — pas d'emoji, fond coloré avec label */}
      {showFallback && (
        <div className="poster-fallback">
          <span className="poster-fallback-label">Affiche indisponible</span>
        </div>
      )}

      {/* Loading skeleton */}
      {showSkeleton && <div className="poster-skeleton" />}

      {/* Actual image */}
      {visible && src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`poster-img ${imgClassName} ${status === 'loaded' ? 'poster-img-visible' : ''}`}
          style={{ objectFit, objectPosition }}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
}
