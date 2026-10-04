import { Link } from '../../router/index.jsx';

export default function Breadcrumbs({ items, className = '' }) {
  return (
    <nav className={`breadcrumbs ${className}`} aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={c.label} style={{ display: 'inline-flex', gap: 10 }}>
          {i > 0 && <span aria-hidden>/</span>}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
