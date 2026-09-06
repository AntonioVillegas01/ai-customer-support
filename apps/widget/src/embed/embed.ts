declare const __WIDGET_APP_URL__: string;

/**
 * Host-page loader. Injects a launcher button and a sandboxed iframe running
 * the chat app. All host<->iframe messaging validates origins on both sides
 * and uses the `acs:` message-type namespace.
 */

interface AcsMessage {
  type: string;
}

export function isAllowedWidgetMessage(event: { origin: string; data: unknown }, widgetOrigin: string): event is { origin: string; data: AcsMessage } {
  if (event.origin !== widgetOrigin) return false;
  const data = event.data;
  if (typeof data !== 'object' || data === null) return false;
  const type = (data as { type?: unknown }).type;
  return typeof type === 'string' && type.startsWith('acs:');
}

function boot(): void {
  const script = document.currentScript as HTMLScriptElement | null;
  const widgetKey = script?.dataset['widgetKey'];
  if (widgetKey === undefined || widgetKey.length === 0) {
    console.error('[acs-widget] missing data-widget-key attribute');
    return;
  }
  const appUrl = script?.dataset['appUrl'] ?? __WIDGET_APP_URL__;
  const widgetOrigin = new URL(appUrl).origin;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483000;';

  const iframe = document.createElement('iframe');
  // Widget key travels in the fragment so it never appears in server logs.
  iframe.src = `${appUrl}#key=${encodeURIComponent(widgetKey)}&host=${encodeURIComponent(window.location.origin)}`;
  iframe.title = 'Support chat';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  iframe.setAttribute('referrerpolicy', 'origin');
  iframe.style.cssText = [
    'border:0;border-radius:16px;width:380px;height:560px;max-width:calc(100vw - 40px);max-height:calc(100vh - 100px)',
    'box-shadow:0 8px 32px rgba(0,0,0,.24);display:none;background:#fff',
    reducedMotion ? '' : 'transition:opacity .15s ease',
  ].join(';');

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Open support chat');
  button.setAttribute('aria-expanded', 'false');
  button.style.cssText =
    'width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:#0f766e;color:#fff;font-size:24px;box-shadow:0 4px 16px rgba(0,0,0,.3);display:block;margin-left:auto;margin-top:12px';
  button.textContent = '💬';

  let open = false;
  const setOpen = (next: boolean): void => {
    open = next;
    iframe.style.display = open ? 'block' : 'none';
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close support chat' : 'Open support chat');
    if (open) iframe.contentWindow?.postMessage({ type: 'acs:opened' }, widgetOrigin);
  };
  button.addEventListener('click', () => setOpen(!open));

  window.addEventListener('message', (event: MessageEvent) => {
    if (!isAllowedWidgetMessage(event, widgetOrigin)) return;
    const type = (event.data as AcsMessage).type;
    if (type === 'acs:close') setOpen(false);
    if (type === 'acs:ready') button.disabled = false;
  });

  container.append(iframe, button);
  document.body.appendChild(container);
}

if (typeof document !== 'undefined' && document.currentScript !== null) boot();
