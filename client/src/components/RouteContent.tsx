import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import './RouteContent.css';

function RoutePending({ fullPage }: { fullPage: boolean }) {
  return <div className={`route-state ${fullPage ? 'route-state-full' : ''}`} role="status" aria-live="polite" aria-busy="true">
    <Loader2 size={22} className="route-state-spinner" aria-hidden="true" />
    <p>화면을 불러오는 중입니다.</p>
  </div>;
}

interface RouteBoundaryProps { children: ReactNode; fullPage: boolean; resetKey: string }
class RouteErrorBoundary extends Component<RouteBoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: RouteBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className={`route-state ${this.props.fullPage ? 'route-state-full' : ''}`} role="alert">
      <h1>화면을 불러오지 못했습니다.</h1>
      <p>연결을 확인한 뒤 화면을 다시 불러와 주세요.</p>
      <button type="button" onClick={() => window.location.reload()}><RefreshCw size={16} aria-hidden="true" />화면 다시 불러오기</button>
    </div>;
  }
}

export function RouteContent({ children, fullPage = false }: { children: ReactNode; fullPage?: boolean }) {
  const { pathname } = useLocation();
  // Search parameters contain document links and may change while saving an editor.
  // A new page must show pending state instead of leaving the old editor editable
  // during a React transition. Keep the outer workspace and query updates stable.
  return <RouteErrorBoundary resetKey={pathname} fullPage={fullPage}>
    <Suspense key={fullPage ? undefined : pathname} fallback={<RoutePending fullPage={fullPage} />}>{children}</Suspense>
  </RouteErrorBoundary>;
}
