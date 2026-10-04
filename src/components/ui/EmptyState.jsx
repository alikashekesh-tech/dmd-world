import s from './EmptyState.module.css';

/* Empty inventory, empty wishlist, no results: a drawing, an arcade-style status line, and one way forward. */
export default function EmptyState({ art, status, title, text, children, compact }) {
  return (
    <div className={`${s.box} ${compact ? s.compact : ''}`}>
      {art && <div className={s.art} aria-hidden="true">{art}</div>}
      {status && <p className={s.status}>{status}</p>}
      <h2 className={s.title}>{title}</h2>
      {text && <p className={s.text}>{text}</p>}
      {children && <div className={s.actions}>{children}</div>}
    </div>
  );
}
