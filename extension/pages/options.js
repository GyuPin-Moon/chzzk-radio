const form = Object.fromEntries(
  ['channel', 'channelError', 'notify', 'rows', 'add', 'saved', 'undo', 'xIcon'].map(id => [id, document.getElementById(id)]),
);
let undoDelete = null;

function flash(text) {
  form.saved.textContent = text;
  form.undo.hidden = true;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => (form.saved.textContent = ''), 2000);
}

function setChannelError(text) {
  form.channelError.textContent = text;
  form.channelError.hidden = !text;
  form.channel.ariaInvalid = String(Boolean(text));
}

chrome.storage.sync.get('notify').then(({ notify = true }) => (form.notify.checked = notify));
form.notify.onchange = async () => {
  await chrome.storage.sync.set({ notify: form.notify.checked });
  flash('저장됨');
};

const picker = followsPicker(document.getElementById('picker'), channelId => {
  form.channel.value = `https://chzzk.naver.com/${channelId}`;
  setChannelError('');
  flash('저장됨');
});

form.channel.onchange = async () => {
  const channelId = form.channel.value.match(/chzzk\.naver\.com\/(?:live\/)?([0-9a-f]{32})/)?.[1];
  if (!channelId) return setChannelError('치지직 방송인 페이지 주소를 넣어 주세요. 예: https://chzzk.naver.com/abc…');
  setChannelError('');
  await chrome.storage.sync.set({ channelId });
  picker.select(channelId);
  flash('저장됨');
};

function addRow(label = '', text = '', before = null) {
  const row = document.createElement('div');
  row.className = 'chip-row';
  const name = Object.assign(document.createElement('input'), { value: label, ariaLabel: '버튼 이름' });
  const body = Object.assign(document.createElement('input'), {
    value: text === label ? '' : text, ariaLabel: '보낼 내용', placeholder: '비우면 버튼 이름을 보내요',
  });
  const del = Object.assign(document.createElement('button'), { className: 'icon danger', ariaLabel: `${label || '빈'} 버튼 삭제` });
  del.append(form.xIcon.content.cloneNode(true));
  del.onclick = () => deleteRow(row);
  row.append(name, body, del);
  form.rows.insertBefore(row, before);
  return name;
}

function deleteRow(row) {
  const next = row.nextElementSibling;
  const [label, text] = [...row.querySelectorAll('input')].map(i => i.value);
  row.remove();
  saveRows('');
  (next?.querySelector('.danger') ?? form.add).focus();
  undoDelete = () => {
    addRow(label, text || label, next?.isConnected ? next : null).focus();
    saveRows('되돌렸어요');
  };
  clearTimeout(flash.timer);
  form.saved.textContent = `'${label || text || '빈'}' 버튼을 지웠어요`;
  form.undo.hidden = false;
  flash.timer = setTimeout(() => {
    form.saved.textContent = '';
    form.undo.hidden = true;
    undoDelete = null;
  }, 6000);
}

form.undo.onclick = () => {
  const restore = undoDelete;
  undoDelete = null;
  restore?.();
};

function toLine(row) {
  const [rawLabel, rawText] = [...row.querySelectorAll('input')].map(i => i.value.trim());
  const label = (rawLabel || rawText).replaceAll('|', '');
  const text = rawText || rawLabel;
  if (!label || !text) return '';
  return label === text ? label : `${label}|${text}`;
}

async function saveRows(message = '저장됨') {
  await chrome.storage.sync.set({ lines: [...form.rows.children].map(toLine).filter(Boolean) });
  if (message) flash(message);
}

form.rows.addEventListener('change', () => saveRows());
form.add.onclick = () => addRow().focus();

chrome.storage.sync.get(['channelId', 'lines']).then(({ channelId, lines = DEFAULT_LINES }) => {
  if (channelId) form.channel.value = `https://chzzk.naver.com/${channelId}`;
  for (const line of lines) addRow(...parseLine(line));
  picker.load(channelId);
});
