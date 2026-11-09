const switchButton = document.getElementById('switch');
const pickerRoot = document.getElementById('picker');
const picker = followsPicker(pickerRoot, () => {
  togglePicker(false);
  switchButton.focus();
  say('채널을 바꿨어요', 'ok');
}, '설정에서 채널 주소를 직접 넣을 수 있어요.');
let pickerLoaded = false;

async function togglePicker(open) {
  pickerRoot.hidden = !open;
  switchButton.ariaExpanded = String(open);
  if (!open || pickerLoaded) return;
  pickerLoaded = true;
  const { channelId } = await chrome.storage.sync.get('channelId');
  await picker.load(channelId);
  pickerRoot.querySelector('.search').focus();
}

switchButton.onclick = () => togglePicker(pickerRoot.hidden);
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage().then(() => window.close());
chrome.storage.sync.get('channelId').then(({ channelId }) => channelId || togglePicker(true));
