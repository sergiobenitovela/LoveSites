const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let map,places=[];const markers=L.layerGroup();

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
sb.auth.getSession().then(({data})=>data.session?start():$('#loginForm').classList.remove('hide'));

$('#loginForm').onsubmit=async e=>{
  e.preventDefault();
  const {error}=await sb.auth.signInWithPassword({email:$('#em').value.trim(),password:$('#pw').value});
  error?$('#err').textContent='Email o contraseña incorrectos':start();
};
$('#out').onclick=async()=>{await sb.auth.signOut();location.reload();};

async function start(){
  $('#loginForm').classList.add('hide');$('#app').classList.remove('hide');
  if(!map){
    map=L.map('map',{zoomControl:false}).setView([40.4,-3.7],6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    markers.addTo(map);
    map.attributionControl.setPosition('bottomleft');
  }
  calInit();calLoad();
  await load();
  if(places.length)map.fitBounds(markers.getBounds().pad(.3),{maxZoom:15});
}

async function load(){
  const {data,error}=await sb.from('places').select('*').order('created_at',{ascending:false});
  if(error)return alert(error.message);
  places=data;markers.clearLayers();calRender();
  places.forEach(p=>L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:`<div class="pin">${p.rating}</div>`,iconSize:[34,34],iconAnchor:[17,17]})}).on('click',()=>view(p)).addTo(markers));
}

function sheet(html){
  const s=$('#sheet');s.innerHTML=html;s.classList.remove('hide');
  const x=$('#x');if(x)x.onclick=closeSheet;
}
const closeSheet=()=>$('#sheet').classList.add('hide');

let locWatch,locTimer,locDot,locCirc;
$('#loc').onclick=()=>{
  if(!navigator.geolocation)return alert('Tu navegador no permite la geolocalización');
  const btn=$('#loc');btn.textContent='…';
  navigator.geolocation.clearWatch(locWatch);clearTimeout(locTimer);
  const stop=()=>{navigator.geolocation.clearWatch(locWatch);clearTimeout(locTimer);btn.textContent='⌖';};
  let first=true;
  locWatch=navigator.geolocation.watchPosition(p=>{
    const ll=[p.coords.latitude,p.coords.longitude],acc=p.coords.accuracy;
    if(!locDot){
      locCirc=L.circle(ll,{radius:acc,color:'#e8728f',weight:1,fillOpacity:.12}).addTo(map);
      locDot=L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#e8728f',fillOpacity:1}).addTo(map);
    }else{locDot.setLatLng(ll);locCirc.setLatLng(ll).setRadius(acc);}
    first?map.setView(ll,17):map.panTo(ll);first=false;
    if(acc<=15)stop();
  },e=>{stop();alert('No se pudo obtener la ubicación: '+e.message);},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  locTimer=setTimeout(stop,15000);
};
const picking=on=>['#pinc','#pickbar'].forEach(s=>$(s).classList.toggle('hide',!on));
$('#fab').onclick=()=>{closeSheet();picking(true);};
$('#pc').onclick=()=>picking(false);
$('#pok').onclick=()=>{picking(false);form(map.getCenter());};

async function shrink(file,max=1400){
  const b=await createImageBitmap(file,{imageOrientation:'from-image'});
  const k=Math.min(1,max/Math.max(b.width,b.height));
  const c=document.createElement('canvas');c.width=b.width*k;c.height=b.height*k;
  c.getContext('2d').drawImage(b,0,0,c.width,c.height);
  return new Promise(r=>c.toBlob(r,'image/jpeg',.82)); // re-encoding también borra el EXIF (GPS incluido)
}

function form(c){
  let chosen=null;
  sheet(`<h2>Nuevo chicheo</h2>
  <input id="fn" type="text" placeholder="Nombre del sitio">
  <div class="row" style="margin:6px 0 0">
    <label class="photo" style="flex:1"><input id="fcam" type="file" accept="image/*" capture="environment" hidden>📷 Hacer foto</label>
    <label class="photo" style="flex:1"><input id="fgal" type="file" accept="image/*" hidden>🖼 Galería</label>
  </div>
  <div id="fl" class="mute" style="text-align:center"></div>
  <div>Nota: <b id="rv">7</b>/10</div><input id="fr" type="range" min="1" max="10" value="7">
  <textarea id="fc" rows="3" placeholder="Nota o recuerdo (opcional)"></textarea>
  <input id="fd" type="date" value="${new Date().toISOString().slice(0,10)}">
  <div class="row"><button class="btn ghost" id="x">Cancelar</button><button class="btn" id="ok">Guardar</button></div>`);
  ['#fcam','#fgal'].forEach(q=>$(q).onchange=e=>{chosen=e.target.files[0]||chosen;$('#fl').textContent=chosen?'✓ Foto lista':'';});
  $('#fr').oninput=e=>$('#rv').textContent=e.target.value;
  $('#ok').onclick=async()=>{
    const name=$('#fn').value.trim();if(!name)return $('#fn').focus();
    const ok=$('#ok');ok.disabled=true;ok.textContent='Guardando…';
    try{
      let path=null;const f=chosen;
      if(f){
        const {data:{user}}=await sb.auth.getUser();
        path=`${user.id}/${crypto.randomUUID()}.jpg`;
        const {error}=await sb.storage.from('fotos').upload(path,await shrink(f),{contentType:'image/jpeg'});
        if(error)throw error;
      }
      const {error}=await sb.from('places').insert({name,lat:c.lat,lng:c.lng,rating:+$('#fr').value,note:$('#fc').value.trim()||null,visited_on:$('#fd').value||null,photo_path:path});
      if(error)throw error;
      closeSheet();load();
    }catch(e){alert('Error: '+e.message);ok.disabled=false;ok.textContent='Guardar';}
  };
}

async function view(p){
  let img='';
  if(p.photo_path){
    const {data}=await sb.storage.from('fotos').createSignedUrl(p.photo_path,3600);
    if(data)img=`<img src="${data.signedUrl}" alt="">`;
  }
  sheet(`${img}<h2>${esc(p.name)} <span class="r">${p.rating}/10</span></h2>
  <p class="mute">${esc(p.visited_on||'')}</p><p>${esc(p.note||'')}</p>
  <div class="row"><button class="btn ghost" id="del">Borrar</button><button class="btn" id="x">Cerrar</button></div>`);
  $('#del').onclick=async()=>{
    if(!confirm('¿Borrar este sitio?'))return;
    if(p.photo_path)await sb.storage.from('fotos').remove([p.photo_path]);
    await sb.from('places').delete().eq('id',p.id);
    closeSheet();load();
  };
}
