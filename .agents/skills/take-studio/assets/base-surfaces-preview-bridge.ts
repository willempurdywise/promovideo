// Development bridge: present the live screen and share its appearance with Take Studio.
// No cookies, account data or storage are exposed.
export function connectTakeStudioPreview() {
  let presenting = false;
  const style = document.createElement('style');
  const present = () => {
    if (!presenting) return;
    const phone = document.querySelector<HTMLElement>('.df-phone');
    const screen = phone?.querySelector<HTMLElement>('.df-screen-area');
    if (!phone || !screen) return;
    const width = screen.offsetWidth, height = screen.offsetHeight;
    const margin = innerWidth < 600 ? 48 : 200;
    const scale = Math.max(.1, Math.min((innerHeight - margin) / height, (innerWidth - 48) / width));
    phone.classList.add('take-studio-phone');
    const css = `html,body,#root,.df-wrap,.df-gallery-scroll{background:#11140f!important;overflow:hidden!important}.df-top-bar,.df-gallery-label,.df-gallery-item:not(:first-child){display:none!important}.take-studio-phone{position:fixed!important;left:50%!important;top:50%!important;width:${width}px!important;height:${height}px!important;margin:0!important;filter:none!important;transform:translate(-50%,-50%) scale(${scale})!important}.take-studio-phone .df-phone__inner{position:relative;width:${width}px!important;height:${height}px!important;transform:none!important}.take-studio-phone .df-screen-area{top:0!important;left:0!important;border-radius:40px!important}.take-studio-phone .df-frame-img{display:none!important}.take-studio-phone .df-status-bar{top:0!important;left:0!important}`;
    if (style.textContent !== css) style.textContent = css;
    if (!style.isConnected) document.head.append(style);
  };
  const observer = new MutationObserver(present);
  observer.observe(document.body, {childList:true,subtree:true});
  window.addEventListener('resize',present);
  const handler = (event: MessageEvent) => {
    if (event.source !== window.parent || !['take-studio:appearance-request','take-studio:presentation'].includes(event.data?.type)) return;
    let origin: URL;
    try { origin = new URL(event.origin); } catch { return; }
    if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:') return;
    if (event.data.type === 'take-studio:presentation') { presenting = true; present(); return; }
    const phone = document.querySelector('.df-phone');
    const app = phone?.querySelector<HTMLIFrameElement>('iframe');
    const query = new URLSearchParams(app ? new URL(app.src).search : location.search);
    const captureQuery = new URLSearchParams({ mode: 'app' });
    for (const key of ['dataset', 'account']) {
      const value = query.get(key);
      if (value) captureQuery.set(key, value);
    }
    window.parent.postMessage({
      type: 'take-studio:appearance', requestId: event.data.requestId,
      appearance: {
        colourScheme: document.documentElement.className.includes('dark') ? 'dark' : 'light',
        nativePhone: !!phone,
        deviceLabel: document.querySelector('.df-picker__chevron')?.closest('button')?.textContent?.trim() || '',
        appSearch: `?${captureQuery}`,
      },
    }, event.origin);
  };
  window.addEventListener('message', handler);
  return () => {window.removeEventListener('message',handler);window.removeEventListener('resize',present);observer.disconnect();style.remove();document.querySelector('.take-studio-phone')?.classList.remove('take-studio-phone');};
}
