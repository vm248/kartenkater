import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { submitErrorReport } from '../errorActions';
import { getPlayerId } from '../gameActions';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; reported: boolean; reporting: boolean; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, reported: false, reporting: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info);
  }

  async handleReport() {
    if (this.state.reporting || this.state.reported || !this.state.error) return;
    this.setState({ reporting: true });
    try {
      await submitErrorReport({
        message: `[Auto] ${this.state.error.message}\n${this.state.error.stack ?? ''}`,
        playerId: getPlayerId(),
      });
      this.setState({ reported: true });
    } catch { /* ignore */ } finally {
      this.setState({ reporting: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { reported, reporting } = this.state;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', padding: '2rem',
        textAlign: 'center', gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--card)', border: '2px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertTriangle size={24} strokeWidth={2} style={{ color: '#e53e3e' }} />
        </div>
        <div>
          <p style={{ fontWeight: 800, fontSize: 18, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Etwas ist schiefgelaufen
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Die App ist auf einen unerwarteten Fehler gestoßen.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
          <button
            onClick={() => window.location.reload()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <RefreshCw size={16} strokeWidth={2} /> Neu laden
          </button>
          <button
            className="secondary"
            disabled={reporting || reported}
            onClick={() => this.handleReport()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {reported ? 'Gemeldet – Danke!' : reporting ? 'Wird gesendet…' : <><Send size={15} strokeWidth={2.5} /> Fehler melden</>}
          </button>
        </div>
      </div>
    );
  }
}
