const API = 'https://api.chzzk.naver.com';
const GAME = 'https://comm-api.game.naver.com/nng_main/v1';

// The chzzk APIs answer 403 to a chrome-extension:// Origin, so this extension's requests present the site's own origin.
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'origin', operation: 'set', value: 'https://chzzk.naver.com' }],
      },
      condition: {
        initiatorDomains: [chrome.runtime.id],
        requestDomains: ['api.chzzk.naver.com', 'comm-api.game.naver.com', 'chat.naver.com'],
        resourceTypes: ['xmlhttprequest', 'websocket'],
      },
    }],
  });
});

chrome.alarms.get('poll', a => a || chrome.alarms.create('poll', { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener(poll);
chrome.runtime.onStartup.addListener(poll);
chrome.runtime.onInstalled.addListener(poll);
chrome.storage.sync.onChanged.addListener(c => c.channelId && poll());

const handlers = {
  refresh: () => poll(),
  listen: () => toggleListen(),
  claim: () => claimPower(),
  followings: () => followings(),
  send: msg => (typeof msg.text === 'string' && msg.text.trim() ? sendChat(msg.text) : Promise.reject(new Error('빈 메시지예요'))),
};

// Only this extension's own pages may ask for actions; scripts injected into chzzk tabs report the chzzk page URL.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const fromOwnPage = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
  const handler = fromOwnPage && Object.hasOwn(handlers, msg?.type) && handlers[msg.type];
  if (!handler) return false;
  handler(msg).then(data => reply({ data }), e => reply({ error: e.message }));
  return true;
});

const seg = encodeURIComponent;

async function followings() {
  const c = await getJson(`${API}/service/v1/channels/followings?page=0&size=505&sortType=FOLLOW`);
  return (c?.followingList ?? []).map(f => ({
    id: f.channelId,
    name: f.channel?.channelName ?? '',
    image: f.channel?.channelImageUrl ? `${f.channel.channelImageUrl}?type=f120_120_na` : '',
    live: Boolean(f.channel?.openLive ?? f.streamer?.openLive),
  }));
}

chrome.tabs.onRemoved.addListener(async tabId => {
  const { listenTabId } = await chrome.storage.session.get('listenTabId');
  if (tabId === listenTabId) await chrome.storage.session.remove('listenTabId');
});

let listenBusy = false;

async function stopListen() {
  const { listenTabId } = await chrome.storage.session.get('listenTabId');
  if (!listenTabId) return;
  await chrome.storage.session.remove('listenTabId');
  await chrome.tabs.remove(listenTabId).catch(() => {});
}

async function toggleListen() {
  if (listenBusy) return;
  listenBusy = true;
  try {
    const { listenTabId } = await chrome.storage.session.get('listenTabId');
    if (listenTabId) return await stopListen();
    await startListen();
  } finally {
    listenBusy = false;
  }
}

async function startListen() {
  const { channelId } = await chrome.storage.sync.get('channelId');
  if (!channelId) throw new Error('채널을 먼저 설정해 주세요');
  const url = `https://chzzk.naver.com/live/${seg(channelId)}`;
  const [prev] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = await chrome.tabs.create({ url, active: true, pinned: true });
  await chrome.storage.session.set({ listenTabId: tab.id });
  await whenLoaded(tab.id);
  const inject = async func => {
    const current = await chrome.tabs.get(tab.id).catch(() => null);
    if (!current?.url?.startsWith(url)) return;
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, func }).catch(e => console.warn(func.name, e));
  };
  // Chrome holds back media in a tab that has never been shown, so the tab stays in front until playback starts.
  await inject(waitForPlayback);
  if (prev) await chrome.tabs.update(prev.id, { active: true }).catch(() => {});
  inject(enableRadioMode);
}

// Runs inside the chzzk page.
function waitForPlayback() {
  return new Promise(resolve => {
    const started = Date.now();
    const timer = setInterval(() => {
      const video = document.querySelector('video');
      const playing = video && !video.paused && video.readyState >= 3;
      if (playing || Date.now() - started > 15000) {
        clearInterval(timer);
        resolve();
      }
    }, 300);
  });
}

function whenLoaded(tabId) {
  return new Promise((resolve, reject) => {
    const done = fn => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      fn();
    };
    const onUpdated = (id, info) => id === tabId && info.status === 'complete' && done(resolve);
    const onRemoved = id => id === tabId && done(() => reject(new Error('방송 탭이 닫혔어요')));
    const timer = setTimeout(() => done(resolve), 20000);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId).then(t => t.status === 'complete' && done(resolve), () => {});
  });
}

// Runs inside the chzzk page. The ad player drops `hide` from its skip button once skipping is allowed,
// and the player shows its radio-mode switch only once an audio-only track is available.
function enableRadioMode() {
  let deadline = Date.now() + 20000;
  const timer = setInterval(() => {
    const skip = document.querySelector('button[data-role="skipBtn"]:not(.hide)');
    if (skip) {
      skip.click();
      deadline = Date.now() + 20000;
      return;
    }
    const box = document.querySelector('.setting-radio-mode');
    if (box?.style.display === 'block') {
      if (!box.checked) box.click();
      clearInterval(timer);
    } else if (Date.now() > deadline) {
      clearInterval(timer);
    }
  }, 500);
}

async function claimPower() {
  const { channelId } = await chrome.storage.sync.get('channelId');
  if (!channelId) throw new Error('채널을 먼저 설정해 주세요');
  const power = await getJson(`${API}/service/v1/channels/${seg(channelId)}/log-power`);
  let claimed = 0;
  for (const c of power?.claims ?? []) {
    const r = await fetch(`${API}/service/v1/channels/${seg(channelId)}/log-power/claims/${seg(c.claimId)}`, { method: 'PUT', credentials: 'include' });
    if (r.ok) claimed += c.amount;
  }
  await poll();
  if (!claimed) throw new Error('지금은 받을 수 있는 통나무가 없어요');
  return claimed;
}

async function getJson(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`요청 실패 (${r.status})`);
  return (await r.json()).content;
}

async function poll() {
  const { channelId } = await chrome.storage.sync.get('channelId');
  if (!channelId) return;
  try {
    const [status, channel] = await Promise.all([
      getJson(`${API}/polling/v2/channels/${seg(channelId)}/live-status`),
      getJson(`${API}/service/v1/channels/${seg(channelId)}`),
    ]);
    if (!channel?.channelName) throw new Error('채널 정보를 찾지 못했어요');
    const live = status?.status === 'OPEN';
    const image = channel.channelImageUrl && `${channel.channelImageUrl}?type=f120_120_na`;
    const [user, power] = await Promise.all([
      getJson(`${GAME}/user/getUserStatus`).catch(() => null),
      getJson(`${API}/service/v1/channels/${seg(channelId)}/log-power`).catch(() => null),
    ]);
    const prev = await chrome.storage.session.get(['live', 'channelId']);
    await chrome.storage.session.set({
      channelId, live, name: channel.channelName, image,
      loggedIn: user ? Boolean(user.loggedIn) : undefined, claims: power?.claims ?? [],
    });
    if (prev.channelId === channelId && prev.live === false && live) {
      notifyLive(channelId, channel.channelName, status.liveTitle, image);
    }
    if (!live) await stopListen();
    chrome.action.setTitle({ title: `${channel.channelName} ${live ? '방송 중' : '오프라인'}` });
    if (image) await setIcon(image, live);
  } catch (e) {
    console.warn('poll', e);
  }
}

async function notifyLive(channelId, name, title, image) {
  const { notify = true } = await chrome.storage.sync.get('notify');
  if (!notify) return;
  const options = { type: 'basic', title: `${name} 방송 시작`, message: title || '제목 없음' };
  const show = iconUrl => chrome.notifications.create(`live:${channelId}`, { ...options, iconUrl });
  await show(image || chrome.runtime.getURL('icons/icon-128.png'))
    .catch(() => show(chrome.runtime.getURL('icons/icon-128.png')))
    .catch(e => console.warn('notify', e));
}

chrome.notifications.onClicked.addListener(id => {
  if (!id.startsWith('live:')) return;
  chrome.tabs.create({ url: `https://chzzk.naver.com/live/${seg(id.slice(5))}` });
  chrome.notifications.clear(id);
});

async function emojiMap(channelId, text) {
  const ids = new Set([...text.matchAll(/\{:([^:}]+):\}/g)].map(m => m[1]));
  if (!ids.size) return {};
  const c = await getJson(`${API}/service/v1/channels/${seg(channelId)}/emoji-packs`);
  const emojis = [...c?.emojiPacks ?? [], ...c?.cheatKeyEmojiPacks ?? [], ...c?.subscriptionEmojiPacks ?? []]
    .flatMap(pack => pack.emojis ?? []);
  return Object.fromEntries(emojis.filter(e => ids.has(e.emojiId)).map(e => [e.emojiId, e.imageUrl]));
}

async function setIcon(url, live) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const ctx = new OffscreenCanvas(32, 32).getContext('2d');
  ctx.filter = live ? 'none' : 'grayscale(1) opacity(0.5)';
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(bmp, 0, 0, 32, 32);
  await chrome.action.setIcon({ imageData: ctx.getImageData(0, 0, 32, 32) });
}

async function sendChat(text) {
  const { channelId } = await chrome.storage.sync.get('channelId');
  if (!channelId) throw new Error('채널을 먼저 설정해 주세요');
  const status = await getJson(`${API}/polling/v2/channels/${seg(channelId)}/live-status`);
  const cid = status?.chatChannelId;
  if (!cid) throw new Error('채팅방을 찾지 못했어요');
  const user = await getJson(`${GAME}/user/getUserStatus`);
  if (!user?.loggedIn) throw new Error('네이버에 로그인하면 채팅을 보낼 수 있어요');
  const token = await getJson(`${GAME}/chats/access-token?channelId=${seg(cid)}&chatType=STREAMING`);
  if (!token?.accessToken) throw new Error('채팅 권한을 받지 못했어요');
  const emojis = await emojiMap(channelId, text);

  const server = [...cid].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 9 + 1;
  const ws = new WebSocket(`wss://kr-ss${server}.chat.naver.com/chat`);
  const base = { svcid: 'game', ver: '2', cid };
  const send = obj => ws.send(JSON.stringify(obj));

  return new Promise((resolve, reject) => {
    const fail = msg => { clearTimeout(timer); ws.close(); reject(new Error(msg)); };
    const timer = setTimeout(() => fail('채팅 서버가 응답하지 않아요'), 5000);
    ws.onerror = () => fail('채팅 서버에 연결하지 못했어요');
    ws.onopen = () => send({
      ...base, cmd: 100, tid: 1,
      bdy: { accTkn: token.accessToken, auth: 'SEND', devType: 2001, uid: user.userIdHash },
    });
    ws.onmessage = e => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.cmd === 0) return send({ cmd: 10000, ver: '2' });
      if (m.cmd === 10100) {
        if (m.retCode !== 0 || !m.bdy?.sid) return fail(m.retMsg || '채팅 연결이 거부됐어요');
        return send({
          ...base, cmd: 3101, tid: 3, sid: m.bdy.sid, retry: false,
          bdy: {
            msg: text,
            msgTime: Date.now(),
            msgTypeCode: 1,
            extras: JSON.stringify({
              chatType: 'STREAMING', osType: 'PC', extraToken: token.extraToken, streamingChannelId: channelId, emojis,
            }),
          },
        });
      }
      // The server answers each request with the same tid; retCode 0 means the message was accepted.
      if (String(m.tid) !== '3') return;
      if (m.retCode !== 0) return fail(m.retMsg ? `전송 거부: ${m.retMsg}` : `전송 거부 (${m.retCode})`);
      clearTimeout(timer);
      ws.close();
      resolve();
    };
  });
}
