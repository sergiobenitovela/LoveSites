/* Calendario: varias relaciones por día, tipo JOB y contador de globos.
   Se carga ANTES que app.js; solo define funciones, que app.js llama cuando todo está listo. */
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let stockMax = 24;           // límite de globos (se guarda en la base de datos)
let calMonth = new Date(), calSel = ymd(new Date()), lastTap = { d: '', t: 0 };
let calDays = new Map();   // 'AAAA-MM-DD' -> { n: relaciones, j: JOB }
let stock = 24;             // globos que quedan

function calInit() {
  const goMonth = (target, sel) => {                // cambia de mes con animación de deslizamiento
    const dir = Math.sign(target - calMonth);
    calMonth = target; if (sel) calSel = sel;
    calRender();
    if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const kf = [{ transform: `translateX(${dir * 36}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }];
      const opt = { duration: 280, easing: 'cubic-bezier(.4, 0, .2, 1)' };
      $('#grid').animate(kf, opt); $('#mtitle').animate(kf, opt);
    }
  };
  const shift = n => goMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1));
  $('#prev').onclick = () => shift(-1);
  $('#next').onclick = () => shift(1);
  $('#today').onclick = () => { const t = new Date(); goMonth(new Date(t.getFullYear(), t.getMonth(), 1), ymd(t)); };
  $('#reset').onclick = async () => {               // restaurar: pregunta el límite y deja el contador lleno
    const v = prompt('¿Cuántos globos tienes ahora de límite?', stockMax);
    if (v === null) return;
    const n = parseInt(v, 10);
    if (!(n >= 1 && n <= 999)) return alert('Escribe un número entero entre 1 y 999.');
    const { data, error } = await sb.rpc('reset_stock', { new_max: n });
    if (error || data == null) return alert('No se pudo restaurar los globos: ' + (error ? error.message : 'sin respuesta'));
    stockMax = n; stock = data; calRender();
  };
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
  let sx = 0, sy = 0;                               // deslizar en horizontal cambia de mes
  $('#cal').addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('#cal').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
  }, { passive: true });
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
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
    sb.from('stock').select('remaining,capacity').eq('id', 1).single(),
  ]);
  if (d.error) return alert('Calendario: ' + d.error.message);
  calDays = new Map();
  d.data.forEach(r => {
    const e = calDays.get(r.day) || { n: 0, j: 0 };
    r.kind === 'job' ? e.j++ : e.n++;
    calDays.set(r.day, e);
  });
  if (s.data) { stock = s.data.remaining; stockMax = s.data.capacity; }
  calRender();
}

/* Añade una relación ('normal' resta un globo, 'job' no) */
async function addHeart(d, kind) {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); // pide permiso con el toque
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
  if (data == null) return alert('No se pudo actualizar el contador de globos: la tabla stock no devolvió datos. Revisa su política (RLS) en Supabase.');
  if (delta < 0 && (data === 0 || data === 5)) notify('Hay que comprar globos');   // un solo aviso, a 5 y al llegar a 0
  stock = data === 0 ? stockMax : data;             // al llegar a 0 se reinicia al límite
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
  let h = '<i></i>'.repeat(lead), rel = 0, job = 0;
  for (let d = 1; d <= total; d++) {
    const k = ymd(new Date(y, m, d)), c = cnt(k), all = c.n + c.j;
    rel += c.n; job += c.j;                         // recuento del mes
    const hearts = all > 3 ? `<span class="n">♥${all}</span>`
      : '<span class="n">♥</span>'.repeat(c.n) + '<span class="j">♥</span>'.repeat(c.j);
    h += `<button data-d="${k}" class="d${k === today ? ' t' : ''}${k === calSel ? ' s' : ''}"><span>${d}</span><small class="h">${hearts}</small></button>`;
  }
  $('#grid').innerHTML = h;
  $('#mtitle').textContent = `${MESES[m]} ${y}`;
  $('#mcount').textContent = `${rel} ${rel === 1 ? 'relación' : 'relaciones'}${job ? ` + ${job} JOB` : ''} · 🎈 ${stock}/${stockMax}`;

  const c = cnt(calSel), ps = places.filter(p => p.visited_on === calSel);
  const title = new Date(calSel + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#dayinfo').innerHTML = `<b>${title}</b>` + (ps.length
    ? ps.map(p => `<div class="item" data-p="${p.id}"><span>${esc(p.name)}</span><span class="r2">${p.rating}/10</span></div>`).join('')
    : '<p class="mute">Ningún sitio este día</p>');
  $('#nv').textContent = c.n; $('#jv').textContent = c.j;
  $('#nm').disabled = c.man === 0;                  // el − solo quita marcas manuales; los sitios se borran desde el mapa
  $('#jm').disabled = c.manj === 0;                  // los sitios JOB se borran desde el mapa
}
