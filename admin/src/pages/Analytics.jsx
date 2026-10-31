import { useApi } from '../lib/hooks.js';
import { money, num } from '../lib/format.js';
import { Chip, Notice, PageHeader, SkeletonRows } from '../ui/kit.jsx';

/* What's measured and how it's set up. Sales figures come from the store's own orders (on the dashboard); visitor
   analytics live in Google Analytics once a Measurement ID is added; the shopping assistant's use is counted here.
   Real figures only: nothing is shown that wasn't measured. */
export default function Analytics() {
  const { data, error } = useApi('/analytics');
  if (error) return <Notice tone="coral" icon="alert">{error.message}</Notice>;
  if (!data) return <SkeletonRows rows={6} />;
  const { ga4, assistant: as } = data.data;
  const t = as.totals;
  const rate = t.questions ? Math.round((t.answered / t.questions) * 100) : null;

  return (
    <>
      <PageHeader hud={<><span className={`led ${ga4.connected ? 'green' : 'amber'}`} />Overview</>} title="Analytics"
        text="Visitor analytics (Google Analytics 4), the shopping assistant, and where to find your sales figures." />
      <div className="stack">
        <section className="surface">
          <div className="surface-head"><h3>Google Analytics 4</h3>{ga4.connected ? <Chip tone="green" led>Connected</Chip> : <Chip tone="amber" led>Not set up</Chip>}</div>
          <div className="surface-body stack" style={{ fontSize: 13.5 }}>
            {ga4.connected ? (
              <>
                <p>Measurement ID <b className="mono">{ga4.measurement_id}</b>. The shop reports page views, product views, product lists, searches, cart changes, checkouts and purchases (in USD, each order once), only for visitors who accept analytics cookies. No names, emails or phone numbers are sent.</p>
                <p className="muted">Reports (visitors, traffic sources, conversions) are in Google Analytics. <a className="linkish" href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Open Google Analytics</a></p>
              </>
            ) : (
              <>
                <p>Google Analytics isn’t connected, so no visitor data is collected and the shop doesn’t ask visitors about analytics cookies.</p>
                <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                  <li>In Google Analytics, create a GA4 property and a Web data stream for the shop’s address.</li>
                  <li>Copy its Measurement ID (it starts with <span className="mono">G-</span>).</li>
                  <li>Paste it in <a className="linkish" href="#/settings">Settings › Analytics &amp; assistant</a> and save.</li>
                </ol>
              </>
            )}
          </div>
        </section>

        <section className="surface">
          <div className="surface-head"><h3>Sales</h3></div>
          <div className="surface-body" style={{ fontSize: 13.5 }}>
            <p>Revenue, orders, best sellers and stock come straight from your orders. <a className="linkish" href="#/">See them on the dashboard</a>.</p>
          </div>
        </section>

        <section className="surface">
          <div className="surface-head"><h3>Shopping assistant · last 30 days</h3>{as.enabled ? <Chip tone="green" led>On</Chip> : <Chip tone="muted">Off</Chip>}</div>
          <div className="kpis" style={{ borderTop: 0 }}>
            <div className="kpi"><span className="label">Questions</span><b>{num(t.questions)}</b></div>
            <div className="kpi"><span className="label">Answered from the store</span><b>{num(t.answered)}{rate != null ? <small className="muted" style={{ fontSize: 13 }}> · {rate}%</small> : null}</b></div>
            <div className="kpi"><span className="label">Sent to a person</span><b>{num(t.unanswered)}</b></div>
            <div className="kpi"><span className="label">AI requests</span><b>{num(t.ai_requests)}</b></div>
          </div>
          <div className="surface-body stack" style={{ fontSize: 13.5 }}>
            {as.ai_connected ? (
              <p>AI provider connected: {num(t.ai_input_tokens)} input and {num(t.ai_output_tokens)} output tokens, about {money(t.ai_cost_usd)} estimated{t.ai_failures ? ` (${num(t.ai_failures)} failed, answered from the store instead)` : ''}. {as.budget.usd != null && as.budget.period ? `Budget ${money(as.budget.usd)} per ${as.budget.period === 'total' ? 'lifetime' : as.budget.period}, ${money(as.budget.spent_usd)} used.` : 'No budget set, so it isn’t used.'}</p>
            ) : (
              <Notice icon="info">No AI provider is connected: the assistant answers from your catalog and settings only, at no cost. Connecting one needs an approved provider, its key on the server, and a budget with its period (per day, month or in total) in Settings.</Notice>
            )}
            <p className="muted">Only counts are kept, never the questions or who asked.</p>
          </div>
        </section>
      </div>
    </>
  );
}
