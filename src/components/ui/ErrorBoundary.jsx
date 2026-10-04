import { Component } from 'react';

const RELOADED = 'dmd:chunk-reload';

/* If a page fails to render, only that page shows a calm message: the header, cart and footer keep working.
   A page whose code can't be downloaded (an old tab after a new release) reloads itself once. */
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|error loading dynamically/i.test(String(error?.message || error));
    if (chunk) {
      let tried = false;
      try { tried = sessionStorage.getItem(RELOADED) === location.pathname; sessionStorage.setItem(RELOADED, location.pathname); } catch { /* storage unavailable */ }
      if (!tried) { location.reload(); return; }
    }
    console.error('[page error]', error, info?.componentStack);
  }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); } // a new page clears the error
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container" style={{ paddingBlock: 'clamp(56px, 8vw, 96px)', maxWidth: 640 }} role="alert">
        <p className="eyebrow">Something went wrong</p>
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', margin: '8px 0 12px' }}>This page didn’t load properly.</h1>
        <p style={{ color: 'var(--text-2)', marginBottom: 24 }}>Your cart and wishlist are safe. Reload the page, or go back to the shop.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button type="button" className="btn btn--primary" onClick={() => location.reload()}>Reload the page</button>
          <a href="/shop" className="btn btn--secondary">Go to the shop</a>
        </div>
      </div>
    );
  }
}
