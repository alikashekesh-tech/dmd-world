import { money, num } from '../../lib/format.js';
import { formatWhen } from '../../lib/zone.js';
import { Icon, Thumb } from '../../ui/kit.jsx';

/* The live preview beside the offer form: what saving it would do, worked out by the server with the same price rule
   as the shop, product pages, cart and checkout (lowest price wins; discounts never add up). */

const off = (o) => (o.discount_type === 'percent' ? `${o.discount_value}% off` : `${money(o.discount_value)} off`);
const STATE = { running: 'running', scheduled: 'scheduled', ended: 'ended', off: 'off' };

function Tile({ n, label, tone, hint }) {
  return <div className={`pv-tile ${tone || ''}`} title={hint}><b className="num">{n == null ? '—' : num(n)}</b><span>{label}</span></div>;
}

export default function OfferPreview({ data, loading, hasTargets, startsLater }) {
  if (!hasTargets) {
    return (
      <section className="pv">
        <header className="pv-head"><h3>Preview</h3></header>
        <p className="pv-empty"><Icon name="sparkle" size={16} />Choose products, brands, categories or the entire store to see which prices change.</p>
      </section>
    );
  }
  const o = data?.outcomes;
  const left = data?.left_out;
  const leftOut = left ? [left.drafts && `${num(left.drafts)} draft${left.drafts === 1 ? '' : 's'}`, left.trashed && `${num(left.trashed)} in the trash`, left.missing_products && `${num(left.missing_products)} deleted product${left.missing_products === 1 ? '' : 's'}`].filter(Boolean) : [];
  return (
    <section className={`pv ${loading ? 'is-loading' : ''}`} aria-live="polite" aria-busy={loading}>
      <header className="pv-head">
        <h3>Preview</h3>
        <span className="pv-when">{loading ? <><span className="spin" />Updating…</> : startsLater && data ? `Prices on ${formatWhen(data.at)}` : 'Prices if saved now'}</span>
      </header>
      <div className="pv-tiles">
        <Tile n={data?.eligible} label="In the shop" hint="Covered products buyers can see: published and not in the trash." />
        <Tile n={o?.decrease} label="Get cheaper" tone="good" hint="Their price goes down with this offer." />
        <Tile n={o?.already_cheaper} label="Already cheaper" tone="warn" hint="Their own sale or another offer already gives a lower price, so this one changes nothing for them." />
        <Tile n={o?.not_applicable} label="Can't apply" tone="muted" hint="A fixed amount as large as the price doesn't apply: an offer never makes a product free." />
      </div>
      {data && !data.priced && <p className="pv-note"><Icon name="info" size={14} />Enter the discount to see the new prices.</p>}
      {leftOut.length > 0 && <p className="pv-note"><Icon name="info" size={14} />Not discounted: {leftOut.join(', ')}. Only published products get offer prices.</p>}

      {data?.overlaps?.length > 0 && (
        <div className="pv-overlaps">
          {data.overlaps.map((x) => (
            <p key={x.id} className="pv-warn"><Icon name="alert" size={15} />
              <span>“{x.name}” ({off(x)}, {STATE[x.state] || x.state}) also covers {num(x.shared)} of these product{x.shared === 1 ? '' : 's'}. Each product gets the lower price of the two; discounts never add up.</span></p>
          ))}
        </div>
      )}

      {data?.sample?.length > 0 && (
        <div className="pv-sample">
          <h4>{data.priced ? 'Sample prices' : 'Sample products'}</h4>
          <ul>
            {data.sample.map((p) => (
              <li key={p.id} className={`pv-row ${p.outcome || ''}`}>
                <Thumb src={p.image} size="sm" />
                <span className="pv-name"><b className="clamp1">{p.name}</b><small>{p.outcome === 'decrease' || !p.outcome ? <span className="mono">{p.sku || 'No SKU'}{p.variants ? ` · ${p.variants} variants, from` : ''}</span> : p.reason}</small></span>
                <span className="pv-prices">
                  {p.outcome === 'decrease'
                    ? <><del>{money(p.current)}</del><b className="good">{money(p.with)}</b></>
                    : <b>{money(p.current)}</b>}
                </span>
              </li>
            ))}
          </ul>
          {data.eligible > data.sample.length && <p className="pv-more">and {num(data.eligible - data.sample.length)} more</p>}
        </div>
      )}
      {data && data.eligible === 0 && <p className="pv-empty"><Icon name="alert" size={16} />None of these products is in the shop, so the offer wouldn’t change any price.</p>}
    </section>
  );
}
