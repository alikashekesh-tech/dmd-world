import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../ui/kit.jsx';

/* A faithful preview of a storefront banner. It is laid out at the storefront's real size (a 1200 px wide desktop
   container, a 390 px phone) and scaled down to fit, so type, crop and overlay look exactly as visitors will see
   them. The markup and numbers mirror src/components/landing/PromoBanners(.module.css). */

const WIDTH = { desktop: 1200, mobile: 358 };

function Scaled({ width, children, className }) {
  const box = useRef(null);
  const inner = useRef(null);
  const [k, setK] = useState(0.4);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      const scale = Math.min(1, box.current.clientWidth / width);
      setK(scale); setH(inner.current.offsetHeight * scale);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current); ro.observe(inner.current);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={box} className={className} style={{ height: h || undefined }}>
      <div ref={inner} style={{ width, transform: `scale(${k})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

export function endsSoon(iso) {
  if (!iso) return null;
  const d = new Date(iso); const left = d.getTime() - Date.now();
  if (left <= 0 || left > 14 * 864e5) return null;
  return `Ends ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

function Banner({ b, device }) {
  const img = device === 'mobile' ? (b.image_mobile_url || b.image_url) : b.image_url;
  const tag = endsSoon(b.ends_at);
  return (
    <article className={`bn bn-${device} ${img ? `bn-img bn-ov-${b.overlay || 'soft'}` : 'bn-plain'} ${device === 'mobile' && b.image_mobile_url ? 'bn-tall' : ''}`}>
      {img && <img className="bn-media" src={img} alt="" style={{ objectPosition: b.focal_point || '50% 50%' }} referrerPolicy="no-referrer" />}
      <div className="bn-body">
        {tag && <span className="bn-tag">{tag}</span>}
        <h2 className="bn-title">{b.title || 'Your banner title'}</h2>
        {b.text && <p className="bn-text">{b.text}</p>}
        {b.link_url && b.link_label && <span className="bn-cta">{b.link_label}<Icon name="arrow" size={15} /></span>}
      </div>
    </article>
  );
}

function Announcement({ b }) {
  return (
    <div className="bn-announce">
      <span className={b.link_url ? 'u' : ''}>{b.title || 'Your announcement'}</span>
      <span className="bn-announce-links">Wishlist · My account</span>
    </div>
  );
}

/** device: 'desktop' | 'mobile'. */
export default function BannerPreview({ banner, device }) {
  if (banner.placement === 'announcement') {
    return <Scaled width={WIDTH[device] + (device === 'mobile' ? 32 : 0)} className="bp-frame bp-announce"><Announcement b={banner} /></Scaled>;
  }
  return (
    <Scaled width={device === 'mobile' ? WIDTH.mobile + 32 : WIDTH.desktop + 80} className={`bp-frame bp-${device}`}>
      <div className="bp-page" style={{ padding: device === 'mobile' ? '20px 16px' : '28px 40px' }}>
        <Banner b={banner} device={device} />
      </div>
    </Scaled>
  );
}
