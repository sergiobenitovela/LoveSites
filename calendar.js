/* Calendario: días marcados a mano (tabla "days") + días con sitio (places.visited_on).
   Se carga ANTES que app.js; solo define funciones, que app.js llama cuando todo está listo. */
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let calMonth = new Date(), calSel = ymd(new Date()), calDays = new Set(), lastTap = { d: '', t: 0 };

function calInit() {
  const shift = n => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1); calRender(); };
  $('#prev').onclick = () => shift(-1);
  $('#next').onclick = () => shift(1);
  $('#today').onclick = () => { const t = new Date(); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); calSel = ymd(t); calRender(); };
  $('#mark').onclick = () => toggleDay(calSel);
  $('#tMap').onclick = () => showTab('map');
  $('#tCal').onclick = () => showTab('cal');
  $('#grid').onclick = e => {                       // un toque selecciona, doble toque marca
    const c = e.target.closest('[data-d]'); if (!c) return;
    const d = c.dataset.d, now = Date.now();
    if (lastTap.d === d && now - lastTap.t < 350) { lastTap = { d: '', t: 0 }; toggleDay(d); }
    else { lastTap = { d, t: now }; calSel = d; calRender(); }
  };
  $('#dayinfo').onclick = e => {
    const it = e.target.closest('[data-p]');
    if (it) view(places.find(p => p.id === it.dataset.p));
  };
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
}

function showTab(t) {
  $('#app').classList.toggle('cal', t === 'cal');
  $('#tMap').classList.toggle('on', t === 'map');
  $('#tCal').classList.toggle('on', t === 'cal');
  closeSheet();
}

async function calLoad() {
  const { data, error } = await sb.from('days').select('day');
  if (error) return alert('Calendario: ' + error.message);
  calDays = new Set(data.map(r => r.day));
  calRender();
}

async function toggleDay(d) {
  const has = calDays.has(d);
  const { error } = has ? await sb.from('days').delete().eq('day', d) : await sb.from('days').insert({ day: d });
  if (error && error.code !== '23505') return alert('Error: ' + error.message);
  has ? calDays.delete(d) : calDays.add(d);
  navigator.vibrate?.(15);
  calSel = d; calRender();
}

function calRender() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), today = ymd(new Date());
  const placeDays = new Set(places.map(p => p.visited_on));
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, total = new Date(y, m + 1, 0).getDate();
  let h = '<i></i>'.repeat(lead), count = 0;
  for (let d = 1; d <= total; d++) {
    const k = ymd(new Date(y, m, d)), mk = calDays.has(k) || placeDays.has(k);
    if (mk) count++;
    h += `<button data-d="${k}" class="d${mk ? ' m' : ''}${k === today ? ' t' : ''}${k === calSel ? ' s' : ''}">${d}</button>`;
  }
  $('#grid').innerHTML = h;
  $('#mtitle').textContent = `${MESES[m]} ${y}`;
  $('#mcount').textContent = `${count} ${count === 1 ? 'día' : 'días'} este mes`;

  const ps = places.filter(p => p.visited_on === calSel), on = calDays.has(calSel);
  const title = new Date(calSel + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#dayinfo').innerHTML = `<b>${title}</b>` + (ps.length
    ? ps.map(p => `<div class="item" data-p="${p.id}"><span>${esc(p.name)}</span><span class="r2">${p.rating}/10</span></div>`).join('')
    : '<p class="mute">Ningún sitio este día</p>');
  $('#mark').textContent = on ? 'Quitar marca' : '♥ Marcar día';
  $('#mark').classList.toggle('ghost', on);
}
