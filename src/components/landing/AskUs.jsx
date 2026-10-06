import { useEffect, useState } from 'react';
import { CONTACT } from '../../data/dmdMenu.js';
import { PhoneIcon, MailIcon } from '../common/icons.jsx';
import useInView, { prefersReducedMotion } from './useInView.js';
import s from './AskUs.module.css';

/* The questions people actually have before buying gaming gear. The reply is only ever "typing…": the point is
   that a person answers, not what a mock-up says. */
const QUESTIONS = [
  'Will a PS4 game run on my PS5?',
  'Does this headset work with a controller?',
  'Which chair fits someone over 120 kg?',
  'Is this the original controller or a copy?',
];

export default function AskUs({ n: number = 5 }) {
  const [ref, { live }] = useInView({ threshold: 0.3 });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!live || prefersReducedMotion()) return undefined;
    const t = setInterval(() => setN((x) => x + 1), 3400);
    return () => clearInterval(t);
  }, [live]);
  const shown = [n - 1, n].filter((k) => k >= 0);

  return (
    <section ref={ref} className={s.sec} aria-labelledby="ask-title">
      <div className={`container ${s.in}`}>
        <div className={s.copy}>
          <p className={s.eyebrow}>{String(number).padStart(2, '0')} · Ask first</p>
          <h2 id="ask-title" className={s.title}>Not sure it fits? Ask a person, not a filter.</h2>
          <p className={s.sub}>
            Old console, new game, odd connector, a chair for someone tall. Call or email DMD World before you buy, and get an answer
            from someone who knows the stock.
          </p>
          <div className={s.actions}>
            <a href={`tel:${CONTACT.tel}`} className={s.call}><PhoneIcon size={18} />{CONTACT.phone}</a>
            <a href={`mailto:${CONTACT.email.toLowerCase()}`} className={s.mail}><MailIcon size={18} />{CONTACT.email.toLowerCase()}</a>
          </div>
        </div>

        <div className={s.phone} aria-hidden="true">
          <div className={s.screen}>
            <div className={s.bar}><span className={s.avatar}>D</span><span><b>DMD World</b><small>Call or email</small></span></div>
            <div className={s.thread}>
              {shown.map((k) => (
                <div key={k} className={`${s.turn} ${k < n ? s.old : ''}`}>
                  <p className={s.q}>{QUESTIONS[k % QUESTIONS.length]}</p>
                  <p className={s.typing}><i /><i /><i /></p>
                </div>
              ))}
            </div>
            <div className={s.input}><span>Ask anything…</span><b /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
