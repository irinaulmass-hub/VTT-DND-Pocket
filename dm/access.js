'use strict';
const hero = document.querySelector('#hero');
const result = document.querySelector('#result');
const link = document.querySelector('#link');
async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok || response.redirected) throw Error('Войдите как мастер и повторите действие');
  return response.json();
}
request('/api/characters').then(data => {
  for (const ch of data.characters) hero.append(new Option(ch.name, ch.id));
}).catch(error => { result.textContent = error.message; });
async function change(revoke) {
  if (!hero.value) return;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  link.value = '';
  try {
    const data = await request('/api/player-access' + (revoke ? '/' + encodeURIComponent(hero.value) : ''), {
      method: revoke ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: revoke ? undefined : JSON.stringify({ characterId: hero.value }),
    });
    if (!revoke) {
      const url = new URL('/player', location.href);
      url.searchParams.set('game', window.currentCampaignId);
      url.hash = new URLSearchParams({ invite: data.token }).toString();
      link.value = url.href;
      link.select();
    }
    result.textContent = revoke ? 'Доступ отозван' : 'Скопируйте ссылку и передайте игроку';
  } catch (error) { result.textContent = error.message; }
  finally { document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}
document.querySelector('#issue').onclick = () => change(false);
document.querySelector('#revoke').onclick = () => change(true);
