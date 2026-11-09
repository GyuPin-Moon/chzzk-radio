const DEFAULT_LINES = ['ㅋㅋㅋㅋ', '티하뭉하', '티바뭉바'];
const COOLDOWN_MS = 3000;
const el = Object.fromEntries(
  ['app', 'img', 'name', 'badge', 'listen', 'login', 'claim', 'buttons', 'msg'].map(id => [id, document.getElementById(id)]),
);
let cooling = false;

function parseLine(line) {
  const i = line.indexOf('|');
  return i < 0 ? [line, line] : [line.slice(0, i), line.slice(i + 1)];
}

async function ask(msg) {
  const r = (await chrome.runtime.sendMessage(msg).catch(() => null)) ?? { error: '확장 프로그램이 응답하지 않아요. 잠시 후 다시 눌러 주세요' };
  if (r.error) say(r.error, 'error');
  return r;
}

function say(text, tone = '') {
  el.msg.textContent = text;
  el.msg.dataset.tone = tone;
}

el.login.onclick = () => chrome.tabs.create({ url: 'https://nid.naver.com/nidlogin.login?url=https://chzzk.naver.com/' });
el.listen.onclick = () => ask({ type: 'listen' });
el.claim.onclick = async () => {
  el.claim.disabled = true;
  const r = await ask({ type: 'claim' });
  if (!r.error) say(`통나무 ${r.data}개를 받았어요`, 'ok');
  el.claim.disabled = false;
};

async function render() {
  const { lines = DEFAULT_LINES, channelId } = await chrome.storage.sync.get(['lines', 'channelId']);
  const s = await chrome.storage.session.get(['channelId', 'live', 'name', 'image', 'listenTabId', 'claims', 'loggedIn']);
  const ready = Boolean(channelId) && s.channelId === channelId;
  const live = ready && s.live;
  const listening = Boolean(s.listenTabId);

  el.name.textContent = !channelId ? '채널을 골라 주세요' : ready ? s.name : '채널 정보를 불러오는 중이에요';
  el.name.title = ready ? s.name : '';
  el.badge.textContent = ready ? (live ? 'LIVE' : '오프라인') : '';
  el.badge.classList.toggle('off', !live);
  if (ready && s.image) el.img.src = s.image;
  else el.img.removeAttribute('src');
  el.img.classList.toggle('off', !live);

  el.listen.ariaPressed = String(listening);
  el.listen.disabled = !listening && !live;
  el.login.hidden = s.loggedIn !== false;
  const power = ready ? (s.claims ?? []).reduce((sum, c) => sum + c.amount, 0) : 0;
  el.claim.hidden = !power;
  el.claim.textContent = `통나무 ${power}개 받기`;

  el.buttons.classList.toggle('cooling', cooling);
  const key = lines.join('\n');
  if (el.buttons.dataset.key !== key) {
    el.buttons.dataset.key = key;
    el.buttons.replaceChildren(...lines.map(line => {
      const [label, text] = parseLine(line);
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => send(text);
      return b;
    }));
  }
  for (const b of el.buttons.children) {
    b.disabled = !live;
    b.ariaDisabled = String(cooling);
  }
}

async function send(text) {
  if (cooling) return;
  cooling = true;
  el.buttons.classList.add('cooling');
  for (const b of el.buttons.children) b.ariaDisabled = 'true';
  say('보내는 중…');
  try {
    const r = await ask({ type: 'send', text });
    if (!r.error) say(`보냄: ${text}`, 'ok');
  } finally {
    setTimeout(() => {
      cooling = false;
      el.buttons.classList.remove('cooling');
      for (const b of el.buttons.children) b.ariaDisabled = 'false';
    }, COOLDOWN_MS);
  }
}

chrome.storage.onChanged.addListener(render);
render();
ask({ type: 'refresh' });
