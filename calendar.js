/* Calendario: varias relaciones por día, tipo JOB y contador de globos.
   Se carga ANTES que app.js; solo define funciones, que app.js llama cuando todo está listo. */
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MAX_STOCK = 24;
let calMonth = new Date(), calSel = ymd(new Date()), lastTap = { d: '', t: 0 };
let calDays = new Map();   // 'AAAA-MM-DD' -> { n: relaciones, j: JOB }
let stock = MAX_STOCK;     // globos que quedan

function calInit() {
  const shift = n => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1); calRender(); };
  $('#prev').onclick = () => shift(-1);
  $('#next').onclick = () => shift(1);
  $('#today').onclick = () => { const t = new Date(); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); calSel = ymd(t); calRender(); };
  $('#np').onclick = () => addHeart(calSel, 'normal');
  $('#nm').onclick = () => removeHeart(calSel, 'normal');
  $('#jp').onclick = () => addHeart(calSel, 'job');
  $('#jm').onclick = () => removeHeart(calSel, 'job');
  $('#tMap').onclick = () => showTab('map');
  $('#tCal').onclick = () => showTab('cal');
  $('#grid').onclick = e => {                       // un toque selecciona, doble toque añade una relación
    const c = e.target.closest('[data-d]'); if (!c) return;
    const d = c.dataset.d, now = Date.now();
    if (lastTap.d === d && now - lastTap.t < 350) { lastTap = { d: '', t: 0 }; addHeart(d, 'normal'); }
    else { lastTap = { d, t: now }; calSel = d; calRender(); }
  };
  $('#dayinfo').onclick = e => {
    const it = e.target.closest('[data-p]');
    if (it) view(places.find(p => p.id === it.dataset.p));
  };
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  $('#bell').onclick = pushEnable;
  pushInit();
}

function showTab(t) {
  $('#app').classList.toggle('cal', t === 'cal');
  $('#tMap').classList.toggle('on', t === 'map');
  $('#tCal').classList.toggle('on', t === 'cal');
  closeSheet();
}

async function calLoad() {
  const [d, s] = await Promise.all([
    sb.from('days').select('day,kind'),
    sb.from('stock').select('remaining').eq('id', 1).single(),
  ]);
  if (d.error) return alert('Calendario: ' + d.error.message);
  calDays = new Map();
  d.data.forEach(r => {
    const e = calDays.get(r.day) || { n: 0, j: 0 };
    r.kind === 'job' ? e.j++ : e.n++;
    calDays.set(r.day, e);
  });
  if (s.data) stock = s.data.remaining;
  calRender();
}

/* Añade una relación ('normal' resta un globo, 'job' no) */
async function addHeart(d, kind) {
  const { error } = await sb.from('days').insert({ day: d, kind });
  if (error) return alert('Error: ' + error.message);
  const e = calDays.get(d) || { n: 0, j: 0 };
  kind === 'job' ? e.j++ : e.n++;
  calDays.set(d, e);
  navigator.vibrate?.(15);
  calSel = d; calRender();
  if (kind === 'normal') adjustStock(-1);
}

/* Quita la última relación añadida de ese tipo (si era normal, devuelve el globo) */
async function removeHeart(d, kind) {
  const { data } = await sb.from('days').select('id').eq('day', d).eq('kind', kind)
    .order('created_at', { ascending: false }).limit(1);
  if (!data?.length) return;
  const { error } = await sb.from('days').delete().eq('id', data[0].id);
  if (error) return alert('Error: ' + error.message);
  const e = calDays.get(d);
  kind === 'job' ? e.j-- : e.n--;
  if (e.n + e.j <= 0) calDays.delete(d);
  calRender();
  if (kind === 'normal') adjustStock(1);
}

/* Globos: la resta y el reinicio los hace la base de datos (adjust_stock) */
async function adjustStock(delta) {
  const { data, error } = await sb.rpc('adjust_stock', { delta });
  if (error) return alert('Globos: ' + error.message);
  if (delta < 0 && (data === 0 || data === 5)) sendPush(data === 0 ? 'empty' : 'low');
  stock = data === 0 ? MAX_STOCK : data;            // al llegar a 0 se reinicia a 24
  calRender();
}

async function notify(msg) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      return reg.showNotification('🎈 LoveSites', { body: msg, icon: 'icon-192.png' });
    }
  } catch (e) {}
  alert(msg);                                       // sin permiso de notificaciones, aviso dentro de la app
}

function calRender() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), today = ymd(new Date());
  const pc = { n: {}, j: {} };                      // cada sitio con fecha cuenta como relación o JOB
  places.forEach(p => { if (!p.visited_on) return; const o = pc[p.kind === 'job' ? 'j' : 'n']; o[p.visited_on] = (o[p.visited_on] || 0) + 1; });
  const cnt = k => { const e = calDays.get(k) || { n: 0, j: 0 }; return { n: e.n + (pc.n[k] || 0), j: e.j + (pc.j[k] || 0), man: e.n, manj: e.j }; };
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, total = new Date(y, m + 1, 0).getDate();
  let h = '<i></i>'.repeat(lead), count = 0;
  for (let d = 1; d <= total; d++) {
    const k = ymd(new Date(y, m, d)), c = cnt(k), all = c.n + c.j;
    if (all) count++;
    const hearts = all > 3 ? `<span class="n">♥${all}</span>`
      : '<span class="n">♥</span>'.repeat(c.n) + '<span class="j">♥</span>'.repeat(c.j);
    h += `<button data-d="${k}" class="d${k === today ? ' t' : ''}${k === calSel ? ' s' : ''}"><span>${d}</span><small class="h">${hearts}</small></button>`;
  }
  $('#grid').innerHTML = h;
  $('#mtitle').textContent = `${MESES[m]} ${y}`;
  $('#mcount').textContent = `${count} ${count === 1 ? 'día' : 'días'} · 🎈 ${stock}/${MAX_STOCK}`;

  const c = cnt(calSel), ps = places.filter(p => p.visited_on === calSel);
  const title = new Date(calSel + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#dayinfo').innerHTML = `<b>${title}</b>` + (ps.length
    ? ps.map(p => `<div class="item" data-p="${p.id}"><span>${esc(p.name)}</span><span class="r2">${p.rating}/10</span></div>`).join('')
    : '<p class="mute">Ningún sitio este día</p>');
  $('#nv').textContent = c.n; $('#jv').textContent = c.j;
  $('#nm').disabled = c.man === 0;                  // el − solo quita marcas manuales; los sitios se borran desde el mapa
  $('#jm').disabled = c.manj === 0;
}

/* ===== Notificaciones push reales ===== */
let pushOn = false;                                  // ¿este móvil está suscrito?
const b64 = s => {                                   // clave VAPID (base64url) -> bytes
  const r = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(r, c => c.charCodeAt(0));
};
const pushLabel = () => { const b = $('#bell'); b.textContent = pushOn ? '🔔 Avisos activados' : '🔔 Activar avisos'; b.disabled = pushOn; };

async function pushSave(sub) {                       // guarda la suscripción de este móvil en Supabase
  const k = sub.toJSON().keys;
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: sub.endpoint, p256dh: k.p256dh, auth: k.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
}

async function pushEnable() {                        // botón "Activar avisos" (el permiso exige un toque del usuario)
  try {
    if (!('PushManager' in window)) return alert('Este navegador no admite push. En iPhone, añade antes la app a la pantalla de inicio.');
    if (await Notification.requestPermission() !== 'granted') return alert('Permiso denegado. Actívalo en los ajustes del móvil.');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC_KEY) });
    await pushSave(sub); pushOn = true; pushLabel();
  } catch (e) { alert('Avisos: ' + e.message); }
}

async function pushInit() {                          // al abrir: si ya había permiso, refresca la suscripción
  if ('PushManager' in window && Notification.permission === 'granted') {
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { await pushSave(sub); pushOn = true; }
    } catch (e) {}
  }
  pushLabel();
}

async function sendPush(type) {                      // pide a la Edge Function que avise a los dos móviles
  const { error } = await sb.functions.invoke('notify', { body: { type } });
  if (error || !pushOn) notify(type === 'empty' ? 'Se acabaron los globos' : 'Comprar globos'); // respaldo local
}
