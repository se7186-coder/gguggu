// 체크리스트 — GitHub 저장 버전
// 목록과 체크는 비공개 데이터 저장소의 data.json 한 파일에 저장됩니다.
// data.json 형식: { title, subtitle, owners:{m,s}, sections:[{id,title,groups:[{id,h,owner,note,items:[{id,t,sub,kids:[{id,t}]}]}]}], checks:{<항목 id>:true} }
// 연결 정보(저장소 이름, 토큰)는 각 기기 브라우저의 localStorage에만 저장됩니다.

const LETTERS = "가나다라마바사아자차카타파하";
const LS = "gguggu-checklist";
const FILE = "data.json";
const POLL_MS = 30000;
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => "x" + Math.random().toString(36).slice(2, 9);
function lsGet(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
function setStatus(t){ $("#status").textContent = t; }

let conn = lsGet(LS+"-conn", null);   // {repo, token}
let docData = null;                   // 화면에 보이는 데이터 (원격 + 아직 안 올라간 변경)
let remote = null;                    // {data, sha} 마지막으로 받은 원격 상태
let ops = [];                         // 올릴 변경: (d) => void
let structOp = null, structTimer = null;
let busy = false;
let filter = "all", editing = false, focusAfter = null;

/* ---------- GitHub API ---------- */
const b64enc = str => { const bytes = new TextEncoder().encode(str); let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin); };
const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));
function api(path, opts={}){
  return fetch(`https://api.github.com/repos/${conn.repo}/contents/${path}`, {
    cache: "no-store",
    ...opts,
    headers: { "Accept":"application/vnd.github+json", "Authorization":"Bearer " + conn.token, "X-GitHub-Api-Version":"2022-11-28", ...(opts.headers||{}) }
  });
}
class GhError extends Error { constructor(status, msg){ super(msg); this.status = status; } }
async function getRemote(){
  const r = await api(FILE);
  if (!r.ok) throw new GhError(r.status, await r.text().catch(()=> ""));
  const j = await r.json();
  return { data: JSON.parse(b64dec(j.content)), sha: j.sha };
}
async function putRemote(data, sha){
  const r = await api(FILE, { method:"PUT", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ message:"체크리스트 업데이트", content: b64enc(JSON.stringify(data, null, 1)), sha }) });
  if (!r.ok) throw new GhError(r.status, await r.text().catch(()=> ""));
  const j = await r.json();
  return j.content.sha;
}
function errText(e){
  const s = e && e.status;
  if (s === 401) return "토큰이 올바르지 않거나 만료되었습니다";
  if (s === 403) return "토큰 권한이 부족하거나 요청 한도를 넘었습니다";
  if (s === 404) return "저장소 또는 data.json을 찾을 수 없습니다(이름·토큰 권한 확인)";
  if (s === 409 || s === 422) return "다른 기기와 동시에 저장되어 충돌했습니다";
  return (e && e.message) || "네트워크 오류";
}

/* ---------- 동기화 ---------- */
function queue(op){ ops.push(op); op(docData); flush(); }
function queueStruct(){
  // 구조(제목·담당자·항목) 변경은 잠깐 모았다가 한 번에 올림
  const snap = { title: docData.title, subtitle: docData.subtitle, owners: clone(docData.owners||{}), sections: clone(docData.sections) };
  structOp = d => { d.title = snap.title; d.subtitle = snap.subtitle; d.owners = snap.owners; d.sections = clone(snap.sections); };
  clearTimeout(structTimer);
  setStatus("저장 대기 중…");
  structTimer = setTimeout(() => { if (structOp){ ops.push(structOp); structOp = null; flush(); } }, 1200);
}
async function flush(){
  if (busy || !remote) return;
  busy = true;
  while (ops.length){
    const batch = ops.splice(0);
    setStatus("저장 중…");
    let tries = 0, ok = false;
    while (!ok){
      const d = clone(remote.data);
      batch.forEach(f => f(d));
      try { const sha = await putRemote(d, remote.sha); remote = { data: d, sha }; ok = true; }
      catch(e){
        if ((e.status === 409 || e.status === 422) && tries++ < 4){
          try { remote = await getRemote(); } catch(e2){ setStatus("저장하지 못했어요: " + errText(e2)); break; }
          continue;
        }
        setStatus("저장하지 못했어요: " + errText(e) + ". 새로고침 후 다시 시도해 주세요.");
        break;
      }
    }
    if (!ok){ busy = false; return; }
  }
  busy = false;
  if (!structOp) setStatus("저장됨 · " + new Date().toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit"}));
  syncView();
}
// 원격 상태 + 아직 안 올린 변경을 화면 데이터로
function syncView(){
  if (!remote) return;
  const next = clone(remote.data);
  ops.forEach(f => f(next));
  if (structOp) structOp(next);
  const structChanged = !docData || JSON.stringify({...next, checks:0}) !== JSON.stringify({...docData, checks:0});
  if (editing && structChanged && docData){
    // 편집 중에는 내 화면의 구조를 유지하고 체크만 갱신
    docData.checks = next.checks || {};
    renderChecks();
    return;
  }
  docData = next;
  structChanged ? build() : renderChecks();
}
async function poll(){
  if (!conn || busy || ops.length || structOp || document.hidden) return;
  try { const r = await getRemote(); if (!remote || r.sha !== remote.sha){ remote = r; syncView(); } setStatus("최신 상태 · 30초마다 자동 갱신"); }
  catch(e){ setStatus("불러오지 못했어요: " + errText(e)); }
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
    $("#resetBox").hidden = editing;
    if (!editing) syncView();
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

/* ---------- 연결 ---------- */
function showGate(msg){
  $("#gate").hidden = false; $("#main").hidden = true; $("#authBar").hidden = true;
  if (msg) $("#gateErr").textContent = msg;
  if (conn){ $("#repoIn").value = conn.repo; }
}
async function start(){
  $("#gate").hidden = true; $("#main").hidden = false;
  $("#who").textContent = "저장소: " + conn.repo;
  $("#authBar").hidden = false;
  setStatus("불러오는 중…");
  try { remote = await getRemote(); }
  catch(e){ showGate("연결하지 못했어요: " + errText(e)); return; }
  docData = null;
  syncView();
  setStatus("최신 상태 · 30초마다 자동 갱신");
}
$("#gate").addEventListener("submit", e => {
  e.preventDefault();
  const repo = $("#repoIn").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const token = $("#tokenIn").value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)){ $("#gateErr").textContent = "저장소는 ‘아이디/저장소이름’ 형식으로 넣어 주세요."; return; }
  if (!token){ $("#gateErr").textContent = "토큰을 넣어 주세요."; return; }
  conn = {repo, token};
  lsSet(LS+"-conn", conn);
  $("#tokenIn").value = "";
  $("#gateErr").textContent = "";
  start();
});
$("#settingsBtn").addEventListener("click", () => {
  lsDel(LS+"-conn");
  showGate("이 기기에 저장된 토큰을 지웠습니다. 다시 연결하려면 정보를 넣어 주세요.");
  conn = null; remote = null; docData = null;
});
setInterval(poll, POLL_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

if (conn) start(); else showGate("");
