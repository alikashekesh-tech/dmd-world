import { useEffect } from 'react';
import { useLocation } from '../../router/index.jsx';
import { useAnalyticsChoice, consent, trackPage } from '../../lib/analytics.js';
import s from './AnalyticsConsent.module.css';

/* Asks once whether DMD World may use analytics cookies (only when the owner has connected Google Analytics), and
   reports each page the visitor opens once they agree. Only the path is sent: query strings can hold private links
   (password reset, order tokens), so they never leave the site. */
export default function AnalyticsConsent() {
  const { ask, choose } = useAnalyticsChoice();
  const { pathname } = useLocation();
  const granted = consent() === 'granted';
  useEffect(() => { if (granted) trackPage(pathname); }, [pathname, granted]);
  if (!ask) return null;
  return (
    <div className={s.bar} role="region" aria-label="Analytics cookies">
      <p>We’d like to use Google Analytics cookies to see which pages and products people visit, so we can improve the shop. No names, emails or phone numbers are shared.</p>
      <div className={s.btns}>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => choose('denied')}>No thanks</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => choose('granted')}>Accept</button>
      </div>
    </div>
  );
}
