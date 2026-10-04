import { Component } from 'react';

/* One screen failing to render (or failing to download after an update) never blanks the whole admin:
   the sidebar keeps working and the screen offers a reload. */
export default class PageError extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[admin screen]', error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    const stale = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String(this.state.error?.message || ''));
    return (
      <div className="empty" role="alert">
        <h3>{stale ? 'The admin was updated' : 'This screen didn’t load'}</h3>
        <p>{stale ? 'Reload to get the latest version.' : 'Nothing was changed. Reload the screen, or go back to the dashboard.'}</p>
        <p style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
          <button type="button" className="btn primary" onClick={() => location.reload()}>Reload</button>
          <a className="btn" href="#/">Dashboard</a>
        </p>
      </div>
    );
  }
}
