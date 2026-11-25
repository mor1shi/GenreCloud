// The word cloud lives in a full tab: a popup closes as soon as the user
// clicks elsewhere, and a long genre lookup would be interrupted.
const api = globalThis.browser ?? globalThis.chrome;

async function openApp() {
  const appUrl = api.runtime.getURL('index.html');
  const tabs = await api.tabs.query({});
  const existing = tabs.find(
    (tab) =>
      typeof tab.id === 'number' && (tab.url === appUrl || tab.url?.startsWith(`${appUrl}#`)),
  );
  if (existing) {
    await api.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await api.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await api.tabs.create({ url: appUrl });
}

api.action.onClicked.addListener(() => {
  openApp();
});

api.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') openApp();
});
