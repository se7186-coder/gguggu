// 체크리스트 — 기기별 저장 버전
// 처음 열면 기본 목록(src/default-data.json)으로 시작합니다.
// 목록과 체크는 이 기기 브라우저(localStorage)에만 저장됩니다. 서버로 보내지 않습니다.
// 다른 기기로 옮길 때는 "백업 링크"를 씁니다. 링크의 # 뒷부분에 목록과 체크가 들어 있고,
// # 뒷부분은 웹 서버로 전송되지 않습니다.
// 데이터 형식: { title, subtitle, owners:{m,s}, sections:[...], checks:{<항목 id>:true} }

import DEFAULT_DATA from "./default-data.json";

const LETTERS = "가나다라마바사아자차카타파하";
const LS = "gguggu-checklist";
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => "x" + Math.random().toString(36).slice(2, 9);
function lsGet(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
function setStatus(t){ $("#status").textContent = t; }

let docData = lsGet(LS+"-data", null);
let filter = "all", editing = false, focusAfter = null;

/* ---------- 저장 ---------- */
function persist(){
  if (lsSet(LS+"-data", docData)) setStatus("이 기기에 저장됨 · " + new Date().toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit"}));
  else setStatus("이 브라우저에 저장할 수 없습니다(사생활 보호 모드 등). 창을 닫으면 사라집니다.");
}
function queue(op){ op(docData); persist(); }
function queueStruct(){ persist(); }

/* ---------- 링크 인코딩 (압축 + base64url) ---------- */
const toB64u = bytes => { let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); };
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
async function pipe(bytes, stream){ return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
async function encodeData(d){
  const raw = new TextEncoder().encode(JSON.stringify(d));
  if (typeof CompressionStream === "function"){
    try { return "z." + toB64u(await pipe(raw, new CompressionStream("deflate-raw"))); } catch(e){}
  }
  return "j." + toB64u(raw);
}
async function decodeData(s){
  const kind = s.slice(0,2), body = fromB64u(s.slice(2));
  const bytes = kind === "z." ? await pipe(body, new DecompressionStream("deflate-raw")) : body;
  const d = JSON.parse(new TextDecoder().decode(bytes));
  if (!d || !Array.isArray(d.sections)) throw new Error("형식 오류");
  return d;
}

/* ---------- 구조 탐색 ---------- */
const owners = () => (docData && docData.owners) || {};
const ownerName = k => owners()[k] || (k==="m" ? "담당자1" : "담당자2");
function allIds(){
  const out = [];
  if (!docData) return out;
  docData.sections.forEach(s => s.groups.forEach(g => g.items.forEach(it => {
    out.push({id:it.id, parent:null});
    (it.kids||[]).forEach(k => out.push({id:k.id, parent:it.id}));
  })));
  return out;
}
function locate(id){
  if (!docData) return null;
  if (id === "__root") return {obj:docData, kind:"root"};
  const ss = docData.sections;
  for (let a=0; a<ss.length; a++){
    if (ss[a].id===id) return {arr:ss, i:a, obj:ss[a], kind:"section"};
    const gs = ss[a].groups;
    for (let b=0; b<gs.length; b++){
      if (gs[b].id===id) return {arr:gs, i:b, obj:gs[b], kind:"group"};
      const its = gs[b].items;
      for (let c=0; c<its.length; c++){
        if (its[c].id===id) return {arr:its, i:c, obj:its[c], kind:"item"};
        const ks = its[c].kids||[];
        for (let d=0; d<ks.length; d++) if (ks[d].id===id) return {arr:ks, i:d, obj:ks[d], kind:"kid"};
      }
    }
  }
  return null;
}
function el(tag, attrs={}, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (v==null || v===false) continue;
    if (k==="class") e.className=v; else if (k==="text") e.textContent=v; else if (k==="value") e.value=v; else e.setAttribute(k,v);
  }
  kids.forEach(c => c && e.append(c));
  return e;
}

/* ---------- 보기 모드 ---------- */
function viewItem(it){
  const cb = el("input",{type:"checkbox",id:"cb-"+it.id,"data-id":it.id});
  const txt = el("span",{class:"txt"+(it.t?"":" empty"),text:it.t||"(내용 없음)"});
  const li = el("li",{"data-id":it.id}, el("label",{class:"item",for:"cb-"+it.id}, cb, txt));
  if (it.sub) li.append(el("div",{class:"sub",text:"· "+it.sub}));
  if (it.kids && it.kids.length) li.append(el("ul",{}, ...it.kids.map(viewItem)));
  return li;
}
function buildView(root){
  docData.sections.forEach((sec, si) => {
    const s = el("section",{});
    s.append(el("div",{class:"sec-head"}, el("h2",{text:`${si+1}. ${sec.title||"(제목 없음)"}`}), el("span",{class:"count","data-count":sec.id})));
    let letter = 0;
    sec.groups.forEach(g => {
      const wrap = el("div",{class:"group","data-owner":g.owner||""});
      const tag = g.owner ? el("span",{class:"tag "+g.owner,text:ownerName(g.owner)}) : null;
      if (g.h) wrap.append(el("h3",{}, document.createTextNode(`${LETTERS[letter++]||"·"}. ${g.h}`), tag));
      else if (tag) wrap.append(el("h3",{}, tag));
      if (g.note) wrap.append(el("div",{class:"note",text:g.note}));
      if (g.items.length) wrap.append(el("ul",{}, ...g.items.map(viewItem)));
      s.append(wrap);
    });
    root.append(s);
  });
}

/* ---------- 편집 모드 ---------- */
function ibtn(act, id, label, title, cls){ return el("button",{type:"button",class:"ib"+(cls?" "+cls:""),"data-act":act,"data-id":id,title,"aria-label":title,text:label}); }
function moveBtns(id){ return [ibtn("up",id,"↑","위로"), ibtn("down",id,"↓","아래로")]; }
function edInput(id, field, value, placeholder, label){ return el("input",{class:"ed",type:"text",value:value||"",placeholder,"data-id":id,"data-field":field,"aria-label":label}); }
function editItem(it, isKid){
  const grow = el("div",{class:"grow"}, edInput(it.id,"t",it.t, isKid?"하위 항목":"할 일","항목 내용"));
  if (!isKid) grow.append(edInput(it.id,"sub",it.sub,"메모 (선택, 체크 안 되는 설명)","메모"));
  const btns = el("div",{class:"ebtns"}, ...moveBtns(it.id));
  if (!isKid) btns.append(ibtn("addKid",it.id,"+하위","하위 항목 추가"));
  btns.append(ibtn("del",it.id,"✕","삭제","del"));
  const li = el("li",{}, el("div",{class:"erow"+(isKid?" kidrow":"")}, grow, btns));
  if (!isKid && it.kids && it.kids.length) it.kids.forEach(k => li.append(editItem(k,true)));
  return li;
}
function buildEdit(root){
  root.append(el("div",{class:"meta-ed"},
    el("label",{}, document.createTextNode("체크리스트 제목"), edInput("__root","title",docData.title,"예: 우리집 체크리스트","제목")),
    el("label",{}, document.createTextNode("제목 아래 한 줄 (선택)"), edInput("__root","subtitle",docData.subtitle,"예: 날짜나 메모","부제")),
    el("div",{class:"meta-row"},
      el("label",{}, document.createTextNode("담당자1 이름"), edInput("__root","owner_m",owners().m,"담당자1","담당자1 이름")),
      el("label",{}, document.createTextNode("담당자2 이름"), edInput("__root","owner_s",owners().s,"담당자2","담당자2 이름")))));
  docData.sections.forEach((sec, si) => {
    const s = el("section",{});
    s.append(el("div",{class:"ehead"},
      el("span",{class:"num",text:`${si+1}.`}),
      edInput(sec.id,"title",sec.title,"섹션 제목","섹션 제목"),
      ...moveBtns(sec.id), ibtn("del",sec.id,"✕","섹션 삭제","del")));
    let letter = 0;
    sec.groups.forEach(g => {
      const sel = el("select",{class:"ed","data-id":g.id,"data-field":"owner","aria-label":"담당자"},
        el("option",{value:"",text:"담당 없음"}), el("option",{value:"m",text:ownerName("m")}), el("option",{value:"s",text:ownerName("s")}));
      sel.value = g.owner||"";
      const ta = el("textarea",{class:"ed note-ed",rows:"1",placeholder:"안내 메모 (선택)","data-id":g.id,"data-field":"note","aria-label":"안내 메모"});
      ta.value = g.note||"";
      const box = el("div",{class:"egroup"},
        el("div",{class:"ehead"},
          el("span",{class:"num",text:g.h ? `${LETTERS[letter++]||"·"}.` : "·"}),
          edInput(g.id,"h",g.h,"소제목 (선택)","소제목"),
          sel, ...moveBtns(g.id), ibtn("del",g.id,"✕","소제목 묶음 삭제","del")),
        ta);
      if (g.items.length) box.append(el("ul",{}, ...g.items.map(it => editItem(it,false))));
      box.append(el("div",{class:"adds"}, el("button",{type:"button",class:"add","data-act":"addItem","data-id":g.id,text:"+ 항목 추가"})));
      s.append(box);
    });
    s.append(el("div",{class:"adds"}, el("button",{type:"button",class:"add","data-act":"addGroup","data-id":sec.id,text:"+ 소제목 묶음 추가"})));
    root.append(s);
  });
  root.append(el("div",{class:"adds",style:"margin-top:28px"}, el("button",{type:"button",class:"add","data-act":"addSection",text:"+ 섹션 추가"})));
}

/* ---------- 그리기 ---------- */
function inputFocused(){ const a = document.activeElement; return $("#list").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type!=="checkbox"; }
function renderHeader(){
  const t = (docData && docData.title) || "체크리스트";
  $("#pageTitle").textContent = t; document.title = t;
  const sub = docData && docData.subtitle;
  $("#pageSub").textContent = sub || ""; $("#pageSub").hidden = !sub;
  const fm = document.querySelector('#filters [data-f="m"]'), fsb = document.querySelector('#filters [data-f="s"]');
  fm.textContent = ownerName("m") + " 담당"; fsb.textContent = ownerName("s") + " 담당";
}
function build(){
  const root = $("#list");
  if (editing && inputFocused() && !focusAfter) return;
  root.replaceChildren();
  renderHeader();
  if (editing) buildEdit(root); else buildView(root);
  if (!editing && !docData.sections.length) root.append(el("div",{class:"empty-state",text:"항목이 없습니다. ‘편집’을 눌러 섹션을 추가해 보세요."}));
  if (focusAfter){
    const f = root.querySelector(`[data-id="${focusAfter.id}"][data-field="${focusAfter.field}"]`);
    focusAfter = null;
    if (f){ f.focus(); f.scrollIntoView({block:"center"}); }
  }
  renderChecks();
}
function renderChecks(){
  const checks = (docData && docData.checks) || {};
  document.querySelectorAll('#list input[type="checkbox"]').forEach(cb => { cb.checked = !!checks[cb.dataset.id]; });
  const ids = allIds();
  const done = ids.filter(x => checks[x.id]).length;
  $("#progText").textContent = `${done} / ${ids.length} 완료`;
  const pct = ids.length ? Math.round(done/ids.length*100) : 0;
  $("#progPct").textContent = pct + "%";
  $("#fill").style.width = pct + "%";
  if (docData) docData.sections.forEach(sec => {
    const c = document.querySelector(`[data-count="${sec.id}"]`); if (!c) return;
    const sIds = [];
    sec.groups.forEach(g => g.items.forEach(it => { sIds.push(it.id); (it.kids||[]).forEach(k=>sIds.push(k.id)); }));
    c.textContent = `${sIds.filter(i=>checks[i]).length}/${sIds.length}`;
  });
  applyFilter();
}
function applyFilter(){
  if (editing) return;
  const checks = (docData && docData.checks) || {};
  document.querySelectorAll(".group").forEach(g => {
    const o = g.dataset.owner;
    g.classList.toggle("hidden-by-filter", (filter==="m"||filter==="s") && o!==filter);
    g.querySelectorAll(":scope > ul > li").forEach(li => {
      const ids = [li.dataset.id, ...[...li.querySelectorAll("li")].map(x=>x.dataset.id)];
      li.classList.toggle("hidden-by-filter", filter==="todo" && ids.every(i => checks[i]));
    });
    if (filter==="todo" && g.querySelector(":scope > ul") && !g.querySelector(":scope > ul > li:not(.hidden-by-filter)")) g.classList.add("hidden-by-filter");
  });
  document.querySelectorAll("#list section").forEach(s => {
    s.classList.toggle("hidden-by-filter", filter!=="all" && !s.querySelector(".group:not(.hidden-by-filter)"));
  });
}

/* ---------- 체크 ---------- */
function toggle(id, val){
  const checks = docData.checks || {};
  const ids = allIds();
  const changes = {[id]: val};
  ids.filter(x => x.parent===id).forEach(k => changes[k.id] = val);
  const item = ids.find(x => x.id===id);
  if (item && item.parent){
    const sibs = ids.filter(x => x.parent===item.parent);
    const all = sibs.every(x => x.id===id ? val : !!checks[x.id]);
    changes[item.parent] = all;
  }
  queue(d => { d.checks = d.checks || {}; for (const [k,v] of Object.entries(changes)){ if (v) d.checks[k] = true; else delete d.checks[k]; } });
  renderChecks();
}
$("#list").addEventListener("change", e => {
  const t = e.target;
  if (t.type==="checkbox" && t.dataset.id){ toggle(t.dataset.id, t.checked); return; }
  if (editing && t.dataset.field){
    const loc = locate(t.dataset.id); if (!loc) return;
    const v = t.value.trim(), f = t.dataset.field;
    if (f.startsWith("owner_")){
      const k = f.slice(6);
      docData.owners = docData.owners || {};
      if ((docData.owners[k]||"") === v) return;
      if (v) docData.owners[k] = v; else delete docData.owners[k];
      queueStruct(); setTimeout(build, 0); return;
    }
    if ((loc.obj[f]||"") === v) return;
    if (v) loc.obj[f] = v; else delete loc.obj[f];
    queueStruct();
    if (f==="h" || f==="title" || t.tagName==="SELECT") setTimeout(build, 0);
  }
});
$("#list").addEventListener("keydown", e => {
  if (e.key==="Enter" && e.target.tagName==="INPUT" && e.target.classList.contains("ed")) e.target.blur();
});

let armed = null, armTimer = null;
$("#list").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act==="addSection"){
    const sec = {id:uid(), title:"", groups:[{id:uid(), items:[]}]};
    docData.sections.push(sec); focusAfter = {id:sec.id, field:"title"};
  } else if (act==="addGroup"){
    const g = {id:uid(), items:[]};
    locate(id).obj.groups.push(g); focusAfter = {id:g.id, field:"h"};
  } else if (act==="addItem"){
    const it = {id:uid()};
    locate(id).obj.items.push(it); focusAfter = {id:it.id, field:"t"};
  } else if (act==="addKid"){
    const p = locate(id).obj; const k = {id:uid()};
    (p.kids = p.kids||[]).push(k); focusAfter = {id:k.id, field:"t"};
  } else if (act==="up" || act==="down"){
    const loc = locate(id); const j = loc.i + (act==="up"?-1:1);
    if (j<0 || j>=loc.arr.length) return;
    [loc.arr[loc.i], loc.arr[j]] = [loc.arr[j], loc.arr[loc.i]];
  } else if (act==="del"){
    if (armed !== b){
      if (armed){ armed.classList.remove("armed"); armed.textContent="✕"; }
      armed = b; b.classList.add("armed"); b.textContent = "삭제?";
      clearTimeout(armTimer); armTimer = setTimeout(() => { b.classList.remove("armed"); b.textContent="✕"; armed=null; }, 3500);
      return;
    }
    armed = null; clearTimeout(armTimer);
    const loc = locate(id);
    const gone = [];
    const collect = o => {
      if (o.groups) o.groups.forEach(collect);
      else if (o.items) o.items.forEach(collect);
      else { gone.push(o.id); (o.kids||[]).forEach(k => gone.push(k.id)); }
    };
    collect(loc.obj);
    loc.arr.splice(loc.i, 1);
    if (gone.some(i => docData.checks && docData.checks[i])) queue(d => { gone.forEach(i => { if (d.checks) delete d.checks[i]; }); });
  } else return;
  queueStruct();
  build();
});

$("#editBtn").addEventListener("click", () => {
  if (editing && document.activeElement) document.activeElement.blur();
  if (!docData) return;
  setTimeout(() => {
    editing = !editing;
    $("#editBtn").setAttribute("aria-pressed", String(editing));
    $("#editBtn").textContent = editing ? "편집 완료" : "편집";
    document.querySelectorAll("#filters .pill").forEach(p => p.disabled = editing);
    $("#resetBox").hidden = editing; $("#shareOut").hidden = true;
    build();
  }, 0);
});

document.querySelectorAll("#filters .pill").forEach(b => b.addEventListener("click", () => {
  filter = b.dataset.f;
  document.querySelectorAll("#filters .pill").forEach(x => x.setAttribute("aria-pressed", x===b ? "true":"false"));
  lsSet(LS+"-filter", filter);
  applyFilter();
}));
$("#resetBtn").addEventListener("click", () => { $("#resetConfirm").hidden = false; });
$("#resetNo").addEventListener("click", () => { $("#resetConfirm").hidden = true; });
$("#resetYes").addEventListener("click", () => {
  $("#resetConfirm").hidden = true;
  queue(d => { d.checks = {}; });
  renderChecks();
});
{ const f = lsGet(LS+"-filter", null); const b = f && document.querySelector(`#filters .pill[data-f="${f}"]`); if (b) b.click(); }

/* ---------- 다른 기기로 옮기기 ---------- */
$("#shareBtn").addEventListener("click", async () => {
  const url = location.origin + location.pathname + "#list=" + await encodeData(docData);
  $("#shareOut").hidden = false;
  $("#shareText").value = url;
  try { await navigator.clipboard.writeText(url); $("#shareMsg").textContent = "링크를 복사했습니다. 다른 기기에서 열면 지금 목록과 체크가 그대로 옮겨집니다. 백업용으로 메모에 보관해 두셔도 됩니다."; }
  catch(e){ $("#shareText").select(); $("#shareMsg").textContent = "아래 링크를 길게 눌러 복사하세요. 다른 기기에서 열면 지금 목록과 체크가 옮겨집니다."; }
});

/* ---------- 시작 ---------- */
let pendingImport = null;
async function checkHash(){
  const m = location.hash.match(/^#list=(.+)$/);
  if (!m) return;
  try { pendingImport = await decodeData(m[1]); }
  catch(e){ setStatus("링크를 읽지 못했습니다. 링크가 잘리지 않았는지 확인해 주세요."); history.replaceState(null, "", location.pathname); return; }
  const n = pendingImport.sections.reduce((a,s)=>a+s.groups.reduce((b,g)=>b+g.items.reduce((c,it)=>c+1+(it.kids||[]).length,0),0),0);
  $("#importMsg").textContent = docData.sections.length
    ? `링크에 담긴 ‘${pendingImport.title||"체크리스트"}’(항목 ${n}개)로 이 기기의 목록과 체크를 바꿀까요? 지금 이 기기의 내용은 사라집니다.`
    : `링크에 담긴 ‘${pendingImport.title||"체크리스트"}’(항목 ${n}개)를 이 기기에 저장할까요?`;
  $("#importBox").hidden = false;
}
$("#importYes").addEventListener("click", () => {
  docData = pendingImport; pendingImport = null; docData.checks = docData.checks || {};
  persist(); $("#importBox").hidden = true; history.replaceState(null, "", location.pathname);
  editing = false; build();
});
$("#importNo").addEventListener("click", () => { pendingImport = null; $("#importBox").hidden = true; history.replaceState(null, "", location.pathname); });

const firstVisit = !docData;
if (firstVisit){ docData = clone(DEFAULT_DATA); docData.checks = {}; persist(); }
build();
setStatus(firstVisit ? "기본 목록으로 시작했습니다. 체크는 이 기기에만 저장됩니다." : "이 기기에만 저장됩니다.");
checkHash();
window.addEventListener("hashchange", checkHash);
