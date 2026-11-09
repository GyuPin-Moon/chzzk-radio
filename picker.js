function followsPicker(root, onPick, emptyHint = '') {
  const search = root.querySelector('.search');
  const list = root.querySelector('.follows');
  const note = root.querySelector('.hint');
  let follows = [];
  let error = '';
  let selected = '';

  function render() {
    const q = search.value.trim();
    const shown = follows.filter(f => f.name.toLowerCase().includes(q.toLowerCase()));
    list.replaceChildren(...shown.map(f => {
      const b = document.createElement('button');
      b.className = 'follow';
      b.ariaPressed = String(f.id === selected);
      b.onclick = () => pick(f.id);
      const img = Object.assign(document.createElement('img'), { alt: '' });
      if (f.image) img.src = f.image;
      img.classList.toggle('off', !f.live);
      const name = Object.assign(document.createElement('span'), { className: 'follow-name', textContent: f.name });
      b.append(img, name);
      if (f.live) b.append(Object.assign(document.createElement('span'), { className: 'live-tag', textContent: 'LIVE' }));
      const li = document.createElement('li');
      li.append(b);
      return li;
    }));
    const text = error
      || (!follows.length ? `팔로우한 채널이 없어요. ${emptyHint}` : !shown.length ? `'${q}'와 일치하는 채널이 없어요` : '');
    note.textContent = text.trim();
    note.hidden = !text;
    search.hidden = Boolean(error) || !follows.length;
  }

  async function pick(channelId) {
    selected = channelId;
    await chrome.storage.sync.set({ channelId });
    render();
    onPick(channelId);
  }

  async function load(current) {
    selected = current ?? '';
    const r = (await chrome.runtime.sendMessage({ type: 'followings' }).catch(() => null)) ?? { error: true };
    error = r.error ? `네이버에 로그인하면 팔로잉 채널이 여기에 나와요. ${emptyHint}`.trim() : '';
    follows = (r.data ?? []).sort((a, b) => b.live - a.live);
    render();
  }

  search.oninput = render;
  return { load, select: id => { selected = id; render(); } };
}
