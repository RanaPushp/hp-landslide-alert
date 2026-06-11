
const TILES=[[31.8,76.5,0.5,0,0,1.0,1.0]];
const DISTS=["BILASPUR", "CHAMBA", "HAMIRPUR", "KANGRA", "KINNAUR", "KULLU", "MANDI", "SHIMLA", "SIRMAUR", "SOLAN", "UNA"];
const TEHS=["AMB", "ANI", "ARKI", "BAGSAID", "BALDWARA", "BANJAR", "BARSAR", "BHAWARNA", "BOHRANJ", "CHANDI", "CHOORI", "DADA SIBA", "DHAGERA", "DHARAMPUR", "GAGRET", "GANGTH", "GHUMARWIN", "GOPALPUR", "HAROLI", "INDORA", "JANDUTA", "JARRI", "JHANJELI", "JWALAMUKHI", "KARSOG", "KOTLI", "KUMARSAIN", "LAD BHAROL", "MAHAKAL", "MARKAND", "MASHOBRA", "MATIANA", "NADUAN", "NAGGAR", "NAGROTA BAGWAN", "NAGROTA SURIAN", "NAGROTA SURIYAN", "NALAGARH", "NANKARI", "NERMAND", "NICHAR", "PADDHAR", "POOH", "PUKHRI", "RAJPURA", "ROHANDA", "SADAR", "SAMOTE", "SANDHOLE", "SANGRAH", "SARAHAN", "SHAHPUR", "SHILLAI", "SUJANPUR", "SUNNI", "SYARI", "TAUNIDEVI", "THANAKALAN", "THURAL", "TIARA", "TISA"];
const DCENT={"BILASPUR": [31.3683, 76.6679], "CHAMBA": [32.6812, 76.3451], "HAMIRPUR": [31.6667, 76.5253], "KANGRA": [32.1077, 76.3081], "KINNAUR": [31.595, 78.4048], "KULLU": [31.9019, 77.3991], "MANDI": [31.6364, 76.9918], "SHIMLA": [31.1905, 77.6041], "SIRMAUR": [30.6681, 77.4232], "SOLAN": [31.0456, 76.8782], "UNA": [31.5786, 76.2038]};

let liveRain={}, liveSoil={};
let computed=[];
let filtered=[];
let currentTab='all';
let showCount=50;

// Populate dropdowns
(function(){
  const ds=document.getElementById('distFilter');
  DISTS.forEach(function(d){var o=document.createElement('option');o.value=d;o.textContent=d;ds.appendChild(o)});
  const ts=document.getElementById('tehFilter');
  TEHS.forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=t;ts.appendChild(o)});
})();

// Physics model
function rainAmp(p14,mx){
  var a=1;
  if(p14>=200)a=2.5+1.5*Math.min((p14-200)/200,1);
  else if(p14>=100)a=1.5+(p14-100)/100;
  else if(p14>=50)a=1+.5*(p14-50)/50;
  var i=1;
  if(mx>=100)i=2.5+Math.min((mx-100)/100,1);
  else if(mx>=60)i=1.5+(mx-60)/40;
  else if(mx>=30)i=1+.5*(mx-30)/30;
  return Math.sqrt(a*i);
}
function soilAmp(sm,tr){
  var b=1;
  if(sm<.15)b=.9;else if(sm>=.35)b=2+1.5*Math.min((sm-.35)/.15,1);else if(sm>=.25)b=1+(sm-.25)/.10;
  return b*Math.min(1+Math.max(0,tr)*5,1.5);
}
function fcstAmp(f){
  if(f<30)return 1;if(f<80)return 1+.5*(f-30)/50;if(f<150)return 1.5+(f-80)/70;return 2.5+.5*Math.min((f-150)/100,1);
}
function classify(p,c){
  if(p>.7||(p>.5&&c>50))return'CRITICAL';
  if(p>.4||(p>.3&&c>30))return'HIGH';
  if(p>.25||(p>.2&&c>20))return'ELEVATED';
  if(p>.15)return'MODERATE';return'LOW';
}

// API
async function fetchWeather(lat,lon){
  var today=new Date().toISOString().slice(0,10);
  var r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&daily=precipitation_sum&past_days=14&forecast_days=7&timezone=Asia/Kolkata');
  var d=await r.json();
  var dates=d.daily.time||[];var prec=d.daily.precipitation_sum||[];
  var past=[],fut=[];
  for(var j=0;j<dates.length;j++){if(prec[j]==null)continue;if(dates[j]<=today)past.push(prec[j]);else fut.push(prec[j]);}
  return{p7:past.slice(-7).reduce(function(a,b){return a+b},0),p14:past.reduce(function(a,b){return a+b},0),f7:fut.reduce(function(a,b){return a+b},0),mx:past.length?Math.max.apply(null,past):0};
}
async function fetchSoil(lat,lon){
  var r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&hourly=soil_moisture_3_to_9cm,soil_moisture_9_to_27cm&past_days=7&forecast_days=1&timezone=Asia/Kolkata');
  var d=await r.json();
  var s9=(d.hourly.soil_moisture_9_to_27cm||[]).filter(function(v){return v!=null});
  var s3=(d.hourly.soil_moisture_3_to_9cm||[]).filter(function(v){return v!=null});
  var deep=s9.length?s9.slice(-24).reduce(function(a,b){return a+b},0)/Math.min(s9.length,24):0;
  var mid=s3.length?s3.slice(-24).reduce(function(a,b){return a+b},0)/Math.min(s3.length,24):0;
  var comp=.55*deep+.45*mid;
  var wa=s9.length>48?s9.slice(0,48).reduce(function(a,b){return a+b},0)/48:deep;
  return{comp:comp,trend:deep-wa,deep:deep};
}

async function fetchLive(){
  var btn=document.getElementById('refBtn');
  btn.classList.add('loading');btn.querySelector('span').textContent='Fetching rainfall...';
  setProg(5);
  try{
    var dnames=Object.keys(DCENT);
    for(var i=0;i<dnames.length;i++){
      var dn=dnames[i];var c=DCENT[dn];
      try{liveRain[dn]=await fetchWeather(c[0],c[1])}catch(e){liveRain[dn]={p7:0,p14:0,f7:0,mx:0}}
      setProg(5+(i/dnames.length)*35);
    }
    btn.querySelector('span').textContent='Fetching soil moisture...';
    for(var i=0;i<dnames.length;i++){
      var dn=dnames[i];var c=DCENT[dn];
      try{liveSoil[dn]=await fetchSoil(c[0],c[1])}catch(e){liveSoil[dn]={comp:0,trend:0,deep:0}}
      setProg(40+(i/dnames.length)*35);
    }
    btn.querySelector('span').textContent='Computing tile predictions...';
    setProg(80);
    computeAll();
    setProg(100);
    renderAll();
    showToast('Live predictions ready!');
  }catch(e){showToast('Error: '+e.message)}
  btn.classList.remove('loading');btn.querySelector('span').textContent='Refresh Live Data & Predict';
}

function computeAll(){
  computed=[];
  for(var k=0;k<TILES.length;k++){
    var t=TILES[k];
    var lat=t[0],lon=t[1],prob=t[2],di=t[3],ti=t[4],dens=t[5],rec=t[6];
    var dist=DISTS[di],teh=TEHS[ti];
    var rain=liveRain[dist]||{p7:0,p14:0,f7:0,mx:0};
    var soil=liveSoil[dist]||{comp:0,trend:0};
    var rA=rainAmp(rain.p14,rain.mx);
    var sA=soilAmp(soil.comp,soil.trend);
    var fA=fcstAmp(rain.f7);
    var comb=Math.pow(rA,.4)*Math.pow(sA,.35)*Math.pow(fA,.25);
    var dynP=Math.min(prob*comb,1);
    var chg=prob>1e-6?((dynP-prob)/prob*100):0;
    var cls=classify(dynP,chg);
    computed.push({lat:lat,lon:lon,prob:prob,dist:dist,teh:teh,dens:dens,rec:rec,rain:rain,soil:soil,rA:rA,sA:sA,fA:fA,comb:comb,dynP:dynP,chg:chg,cls:cls});
  }
  computed.sort(function(a,b){return b.dynP-a.dynP});
}

function applyFilters(){
  var dv=document.getElementById('distFilter').value;
  var tv=document.getElementById('tehFilter').value;
  var sv=document.getElementById('searchBox').value.toLowerCase();
  filtered=computed.filter(function(t){
    if(dv&&t.dist!==dv)return false;
    if(tv&&t.teh!==tv)return false;
    if(currentTab!=='all'&&t.cls!==currentTab)return false;
    if(sv){var s=(t.lat+' '+t.lon+' '+t.dist+' '+t.teh).toLowerCase();if(s.indexOf(sv)===-1)return false;}
    return true;
  });
  showCount=50;
  renderTiles();
}

function setTab(tab){
  currentTab=tab;
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});
  var id=tab==='all'?'tabAll':tab==='CRITICAL'?'tabCrit':tab==='HIGH'?'tabHigh':'tabElev';
  document.getElementById(id).classList.add('active');
  applyFilters();
}

function renderAll(){
  var nC=0,nH=0,nE=0,nM=0;
  for(var i=0;i<computed.length;i++){
    var c=computed[i].cls;
    if(c==='CRITICAL')nC++;else if(c==='HIGH')nH++;else if(c==='ELEVATED')nE++;else nM++;
  }
  document.getElementById('nC').textContent=nC.toLocaleString();
  document.getElementById('nH').textContent=nH.toLocaleString();
  document.getElementById('nE').textContent=nE.toLocaleString();
  document.getElementById('nM').textContent=nM.toLocaleString();

  var now=new Date();
  document.getElementById('ts').textContent='Updated: '+now.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})+' IST | '+computed.length.toLocaleString()+' tiles';

  var meanAmp=computed.reduce(function(a,t){return a+t.comb},0)/computed.length;
  var gt70=computed.filter(function(t){return t.dynP>.7}).length;
  var sm='<div class="summary-card"><h3>Live Prediction Summary</h3>';
  sm+='<div class="row"><span class="k">Total HP grid tiles</span><span class="val">795,826</span></div>';
  sm+='<div class="row"><span class="k">High-risk tiles shown</span><span class="val">'+computed.length.toLocaleString()+'</span></div>';
  sm+='<div class="row"><span class="k">Mean amplification</span><span class="val">'+meanAmp.toFixed(3)+'x</span></div>';
  sm+='<div class="row"><span class="k">Max dynamic risk</span><span class="val">'+(computed[0]?computed[0].dynP.toFixed(4):'-')+'</span></div>';
  sm+='<div class="row"><span class="k">Tiles > 0.70 risk</span><span class="val">'+gt70.toLocaleString()+'</span></div>';
  sm+='</div>';
  document.getElementById('summaryDiv').innerHTML=sm;

  var wx='<div class="weather-section"><div style="font-size:13px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Live Weather by District</div><div class="wx-grid">';
  var dkeys=Object.keys(liveRain).sort(function(a,b){return(liveRain[b].p14||0)-(liveRain[a].p14||0)});
  for(var j=0;j<dkeys.length;j++){
    var dn=dkeys[j];var r=liveRain[dn]||{};var s=liveSoil[dn]||{};
    wx+='<div class="wx-card"><div class="dn">'+dn+'</div>';
    wx+='<div class="wr"><span>Rain 14d</span><span class="wv">'+(r.p14||0).toFixed(0)+'mm</span></div>';
    wx+='<div class="wr"><span>Fcst 7d</span><span class="wv">'+(r.f7||0).toFixed(0)+'mm</span></div>';
    wx+='<div class="wr"><span>Max day</span><span class="wv">'+(r.mx||0).toFixed(0)+'mm</span></div>';
    wx+='<div class="wr"><span>Soil</span><span class="wv">'+(s.comp||0).toFixed(3)+'</span></div></div>';
  }
  wx+='</div></div>';
  document.getElementById('wxDiv').innerHTML=wx;
  document.getElementById('shareAllDiv').style.display='block';
  filtered=computed;showCount=50;renderTiles();
}

function renderTiles(){
  var list=document.getElementById('tileList');
  var badge=document.getElementById('countBadge');
  var show=filtered.slice(0,showCount);
  badge.textContent='Showing '+Math.min(showCount,filtered.length).toLocaleString()+' of '+filtered.length.toLocaleString()+' tiles';
  var h='';
  for(var i=0;i<show.length;i++){
    var t=show[i];
    var cc=t.cls==='CRITICAL'?'critical':t.cls==='HIGH'?'high':t.cls==='ELEVATED'?'elevated':'moderate';
    var bc=t.cls==='CRITICAL'?'var(--red)':t.cls==='HIGH'?'var(--orange)':t.cls==='ELEVATED'?'var(--yellow)':'var(--green)';
    var bw=Math.min(t.dynP*100,100);
    var chgStr=(t.chg>=0?'+':'')+t.chg.toFixed(0)+'%';
    h+='<div class="tile-card '+cc+'">';
    h+='<div class="top-row"><span class="tag">'+t.cls+'</span><span style="font-size:10px;color:var(--dim)">#'+(i+1)+'</span></div>';
    h+='<div class="coords"><a href="https://www.google.com/maps?q='+t.lat+','+t.lon+'&z=15" target="_blank">'+t.lat.toFixed(4)+'°N, '+t.lon.toFixed(4)+'°E</a></div>';
    h+='<div class="detail">'+t.dist+' • '+t.teh+' • Change: '+chgStr+'</div>';
    h+='<div class="metrics">';
    h+='<div class="m"><div class="v" style="color:'+bc+'">'+t.dynP.toFixed(3)+'</div><div class="l">Risk</div></div>';
    h+='<div class="m"><div class="v">'+t.prob.toFixed(3)+'</div><div class="l">Base</div></div>';
    h+='<div class="m"><div class="v">'+(t.rain.p14||0).toFixed(0)+'</div><div class="l">Rain14d</div></div>';
    h+='<div class="m"><div class="v">'+t.comb.toFixed(2)+'x</div><div class="l">Amp</div></div>';
    h+='</div>';
    h+='<div class="risk-bar"><div class="fill" style="width:'+bw+'%;background:'+bc+'"></div></div>';
    h+='<div class="share-row"><button class="wa" onclick="shareTile('+i+')">WhatsApp</button><button class="cp" onclick="copyTile('+i+')">Copy</button></div>';
    h+='</div>';
  }
  list.innerHTML=h;
  document.getElementById('loadMore').style.display=showCount<filtered.length?'block':'none';
}

function showMore(){showCount+=50;renderTiles()}

function buildTileMsg(i){
  var t=filtered[i];if(!t)return'';
  var em=t.cls==='CRITICAL'?'🔴':t.cls==='HIGH'?'🟠':t.cls==='ELEVATED'?'🟡':'🟢';
  var chgStr=(t.chg>=0?'+':'')+t.chg.toFixed(0)+'%';
  var action=t.cls==='CRITICAL'?'ACTION: Evacuate if needed. Pre-position rescue teams. Monitor hourly.':t.cls==='HIGH'?'ACTION: Enhanced monitoring. Alert field teams. Check slopes.':'ACTION: Watch for rainfall increase.';
  return em+' *LANDSLIDE ALERT - TILE*\nCoordinates: '+t.lat.toFixed(4)+'°N, '+t.lon.toFixed(4)+'°E\nGoogle Maps: https://www.google.com/maps?q='+t.lat+','+t.lon+'&z=15\nDistrict: '+t.dist+' | Tehsil: '+t.teh+'\nStatus: *'+t.cls+'*\nDynamic Risk: '+t.dynP.toFixed(4)+' (Base: '+t.prob.toFixed(4)+', '+chgStr+')\nRainfall 14d: '+(t.rain.p14||0).toFixed(0)+'mm | Forecast: '+(t.rain.f7||0).toFixed(0)+'mm\nSoil Moisture: '+(t.soil.comp||0).toFixed(3)+'\nAmplification: '+t.comb.toFixed(2)+'x\n\n'+action+'\n\n_HPSDMA AI Landslide Agent - Tile Prediction_\n_'+new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+'_';
}

function shareTile(i){window.open('https://wa.me/?text='+encodeURIComponent(buildTileMsg(i)),'_blank')}
function copyTile(i){navigator.clipboard.writeText(buildTileMsg(i)).then(function(){showToast('Copied!')})}

function shareAllWA(){
  var top=filtered.slice(0,15);
  var nC=computed.filter(function(t){return t.cls==='CRITICAL'}).length;
  var nH=computed.filter(function(t){return t.cls==='HIGH'}).length;
  var dt=new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  var m='🚨 *HP LANDSLIDE TILE ALERT*\n'+dt+' IST\n\n*'+nC+' CRITICAL | '+nH+' HIGH risk tiles*\n\nTop locations:\n';
  for(var j=0;j<top.length;j++){
    var t=top[j];
    m+='● '+t.lat.toFixed(4)+'°N,'+t.lon.toFixed(4)+'°E ('+t.teh+','+t.dist+') Risk='+t.dynP.toFixed(3)+' ['+t.cls+']\n';
  }
  m+='\nMap: https://www.google.com/maps?q='+(top[0]?top[0].lat:31.8)+','+(top[0]?top[0].lon:76.5)+'&z=12\n\n_HPSDMA AI Landslide Agent_';
  window.open('https://wa.me/?text='+encodeURIComponent(m),'_blank');
}

function setProg(p){document.getElementById('prog').style.width=p+'%';if(p>=100)setTimeout(function(){document.getElementById('prog').style.width='0%'},1000)}
function showToast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2500)}

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
