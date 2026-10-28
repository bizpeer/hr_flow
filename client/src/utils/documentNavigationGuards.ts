type DocumentGuard = (event: Event) => void;
type DocumentChannel = 'template' | 'drafting';
const guards = new Map<DocumentChannel, DocumentGuard>();
const dispatchHistory = (event: Event) => {
  for (const guard of guards.values()) guard(event);
};

// App imports this tiny module eagerly, before HashRouter installs history listeners.
// Page code can load later without changing the order of unsaved-document protection.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', dispatchHistory, true);
  window.addEventListener('hashchange', dispatchHistory, true);
  import.meta.hot?.dispose(() => {
    window.removeEventListener('popstate', dispatchHistory, true);
    window.removeEventListener('hashchange', dispatchHistory, true);
    guards.clear();
  });
}

export function registerDocumentNavigationGuard(channel: DocumentChannel, guard: DocumentGuard) {
  guards.set(channel, guard);
  return () => { if (guards.get(channel) === guard) guards.delete(channel); };
}
