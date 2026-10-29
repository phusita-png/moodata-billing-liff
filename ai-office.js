/* ai-office.js — 🤖 ห้องทำงาน AI (เฟส 1 · 29 ต.ค. 69 · spec yindee-ai-office/docs/spec-phase1.md §9)
   โหลดตอนเปิดเมนูครั้งแรก (renderAiOffice ใน user-app.html) · หน้าหลักไม่ต้องแบกโค้ดนี้ทุกครั้ง
   3 หน้า: aiofc ล็อบบี้ · aidesk หน้าโต๊ะ · aiappr ห้องอนุมัติ
   คุยกับ Worker yindee-ai-office ด้วย "ตั๋ว" ที่ขอจากยินดี (waOfficeTicket) — ไม่ใช้บัตรผ่านของยินดีตรง ๆ
   ⚠️ ข้อความที่มาจาก Worker/AI ผ่าน esc() ทุกชิ้น · ห้ามต่อ HTML จากข้อความ AI ตรง ๆ */
(function(){
  'use strict';
  var H=null;   // host จาก user-app: { main, view(), go(v), esc, url, base, v, ticket() }
  var S={ room:'', desk:'MGR-001', appr:'', rooms:null, mgrOut:'' };
  var ROLE={ 'MGR-001':'หัวหน้า AI', 'AUD-001':'ตรวจสอบ', 'ACC-001':'บัญชี / ภาษี', 'HR-001':'HR / Payroll', 'DEV-001':'ระบบ / Dev', 'PM-001':'ติดตามลูกค้า' };
  var COLOR={ 'MGR-001':'#6EC1F0', 'AUD-001':'#F2726B', 'ACC-001':'#F48FB1', 'HR-001':'#57C28B', 'DEV-001':'#B8BCC8', 'PM-001':'#A78BFA' };
  var DESKS=['MGR-001','AUD-001','ACC-001','HR-001','DEV-001','PM-001'];
  var ST={ idle:'ว่าง', working:'กำลังทำ', waiting:'รอพี่', blocked:'ติดปัญหา' };
  var TOOL={ board_read:'ดูกระดานงาน', task_status:'ดูสถานะงาน', plan_propose:'เสนอแผนงาน', draft_text:'ร่างข้อความ' };
  var EFFORT={ low:'ต่ำ', medium:'กลาง', high:'สูง', xhigh:'สูงมาก', max:'สูงสุด' };
  var RISK={ 1:'อ่านอย่างเดียว', 2:'ร่างงาน', 3:'ต้องอนุมัติ' };

  function esc(s){ return H.esc(s); }
  function $(id){ return document.getElementById(id); }
  function ss(k,v){
    try{
      if(v===undefined) return sessionStorage.getItem(k);
      if(v===null) sessionStorage.removeItem(k); else sessionStorage.setItem(k,v);
    }catch(e){}
    return null;
  }
  function img(id, bust){ return H.base+'characters/'+id.toLowerCase()+(bust?'-bust':'')+'.webp?v='+H.v; }
  function money(n){ return (Math.round((+n||0)*100)/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function modelName(m){
    var x=String(m||'').match(/claude-(\w+)-(\d+)-(\d+)/);
    return x ? x[1].charAt(0).toUpperCase()+x[1].slice(1)+' '+x[2]+'.'+x[3] : (m||'-');
  }
  function thDate(d){
    if(!d) return '-';
    var x=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); if(!x) return esc(d);
    var M=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return (+x[3])+' '+M[+x[2]-1];
  }
  function toast(msg, bad){
    var t=document.createElement('div'); t.className='aio-toast'+(bad?' bad':''); t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); },400); }, 3200);
  }
  function fail(e){
    H.main.innerHTML='<div class="aio"><div class="card aio-err"><b>เปิดห้องทำงาน AI ไม่สำเร็จ</b><p>'+esc(e&&e.message||e)+'</p>'+
      '<button class="aio-btn" id="aioRetry">ลองใหม่</button></div></div>';
    $('aioRetry').onclick=function(){ render(H.view(), H); };
  }

  // ───── ตั๋ว + เรียก Worker ─────
  var TK=null;
  function ticket(force){
    if(!force){
      if(!TK){ try{ TK=JSON.parse(ss('aio.tk')||'null'); }catch(e){ TK=null; } }
      if(TK && TK.exp>Date.now()) return Promise.resolve(TK.ticket);
    }
    return H.ticket().then(function(r){
      if(!r||!r.ok) throw new Error((r&&r.error)||'ขอตั๋วเข้าห้องทำงาน AI ไม่สำเร็จ');
      TK={ ticket:r.ticket, exp:r.exp }; ss('aio.tk', JSON.stringify(TK));
      return r.ticket;
    });
  }
  function api(method, path, body, again){
    return ticket(again).then(function(tk){
      var o={ method:method, headers:{ Authorization:'Bearer '+tk } };
      if(body){ o.headers['Content-Type']='application/json'; o.body=JSON.stringify(body); }
      return fetch(H.url+'/api/ai-office'+path, o).catch(function(){ throw new Error('เชื่อมต่อห้องทำงาน AI ไม่ได้ (ตรวจอินเทอร์เน็ต)'); })
        .then(function(res){
          return res.json().catch(function(){ return { ok:false, error:'ห้องทำงาน AI ตอบผิดรูปแบบ ('+res.status+')' }; }).then(function(j){
            // ตั๋วหมดอายุ/กุญแจเปลี่ยน → ขอตั๋วใหม่ 1 ครั้ง
            if(res.status===401 && !again){ TK=null; ss('aio.tk',null); return api(method, path, body, true); }
            if(!j.ok){ var e=new Error(j.error||'ระบบขัดข้อง'); e.budget=!!j.budget; throw e; }
            return j;
          });
        });
    });
  }
  function q(){ return '?room='+encodeURIComponent(S.room); }
  function ensureRoom(){
    if(S.room) return Promise.resolve(S.room);
    return api('GET','/me').then(function(r){
      S.rooms=r.rooms||[];
      var home=S.rooms.filter(function(x){ return x.code==='MOODATA'; })[0]||S.rooms[0];
      if(!home) throw new Error('ตั๋วนี้ไม่มีห้องที่เข้าได้');
      setRoom(home.code);
      return S.room;
    });
  }
  function busyMsg(e){
    return e&&e.budget ? 'งบ AI วันนี้หมดแล้วค่ะ — ปุ่มคำถามสำเร็จรูปยังใช้ได้ (ตอบจากข้อมูล ไม่เสียเงิน)' : (e&&e.message||'ระบบขัดข้อง');
  }

  // ───── ชิ้นส่วนที่ใช้ซ้ำ ─────
  /* allowAll = ล็อบบี้เท่านั้น (ตัวเลือก "ทุกห้อง" · spec §13) · หน้าโต๊ะ/ห้องอนุมัติต้องเป็นห้องจริงเสมอ */
  function roomPicker(rooms, allowAll){
    if(!rooms || rooms.length<2) return '<span class="aio-chip">ห้อง '+esc((rooms&&rooms[0]&&rooms[0].name)||S.room)+'</span>';
    return '<label class="aio-room"><span>ห้อง</span><select id="aioRoom">'+
      (allowAll?'<option value="*"'+(S.room==='*'?' selected':'')+'>ทุกห้อง (ภาพรวม)</option>':'')+
      rooms.map(function(r){
      return '<option value="'+esc(r.code)+'"'+(r.code===S.room?' selected':'')+'>'+esc(r.name)+' ('+esc(r.code)+')</option>'; }).join('')+'</select></label>';
  }
  function setRoom(code){
    S.room=code; ss('aio.room', code); S.mgrOut='';
    if(code!=='*'){ S.lastRoom=code; ss('aio.lastRoom', code); }
  }
  function backToLobby(){
    if(S.backAll){ S.backAll=false; setRoom('*'); }
    H.go('aiofc');
  }
  function bindRoom(){
    var el=$('aioRoom'); if(!el) return;
    el.onchange=function(){ S.backAll=false; setRoom(el.value); render(H.view(), H); };
  }
  /* หน้าโต๊ะ/ห้องอนุมัติเปิดจากโหมดทุกห้อง → ใช้ห้องจริงล่าสุดที่เคยเลือก (ไม่มี = ห้องแรกในตั๋ว) */
  function concreteRoom(){
    if(S.room!=='*') return Promise.resolve(S.room);
    var last=S.lastRoom||ss('aio.lastRoom');
    S.backAll=true;
    if(last){ S.room=last; return Promise.resolve(last); }
    S.room=''; return ensureRoom();
  }
  function badge(m){
    if(!m) return '';
    if(m.answeredBy==='local' || m.answered_by==='local') return '<span class="aio-bdg loc">ตอบจากข้อมูล · ฟรี</span>';
    var at=m.attachments||m.meta||m;
    return '<span class="aio-bdg ai">AI · '+esc(modelName(at.model))+(at.costThb!=null?' · '+money(at.costThb)+' บาท':'')+'</span>';
  }
  function planCard(taskId, plan, status){
    if(!plan) return '';
    var subs=plan.subtasks||[];
    var rows=subs.map(function(s,i){
      return '<tr><td class="n">'+(i+1)+'</td><td><span class="aio-dot" style="background:'+(COLOR[s.agent]||'#ccc')+'"></span>'+esc(ROLE[s.agent]||s.agent)+'</td>'+
        '<td><b>'+esc(s.title)+'</b>'+(s.brief?'<div class="aio-sub">'+esc(s.brief)+'</div>':'')+'</td>'+
        '<td><span class="aio-risk r'+(+s.risk_level||1)+'">'+esc(RISK[s.risk_level]||s.risk_level)+'</span></td><td>'+thDate(s.due_date)+'</td></tr>';
    }).join('');
    var qs=(plan.questions||[]).filter(Boolean);
    var act;
    if(status==='plan_proposed') act='<div class="aio-plan-act"><button class="aio-btn ghost" data-plan-cancel="'+esc(taskId)+'">ยกเลิกแผน</button>'+
      '<button class="aio-btn" data-plan-ok="'+esc(taskId)+'"'+(subs.length?'':' disabled')+'>ยืนยัน สร้าง '+subs.length+' งานย่อย</button></div>';
    else act='<div class="aio-plan-done">'+(status==='rejected'?'ยกเลิกแผนนี้แล้ว':'ยืนยันแผนแล้ว · สร้างงานย่อยเรียบร้อย')+'</div>';
    return '<div class="aio-plan"><div class="aio-plan-h">แผนงานที่หัวหน้า AI เสนอ · '+subs.length+' งานย่อย</div>'+
      (plan.summary?'<p class="aio-plan-s">'+esc(plan.summary)+'</p>':'')+
      '<div class="aio-tw"><table class="aio-t"><thead><tr><th class="n">#</th><th>โต๊ะ</th><th>งาน</th><th>ระดับ</th><th>กำหนด</th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="5" class="aio-empty">ยังแตกงานไม่ได้</td></tr>')+'</tbody></table></div>'+
      (qs.length?'<div class="aio-plan-q"><b>หัวหน้า AI ขอถามพี่ก่อน</b><ul>'+qs.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></div>':'')+
      act+'</div>';
  }
  function bindPlans(root, after){
    Array.prototype.forEach.call(root.querySelectorAll('[data-plan-ok],[data-plan-cancel]'), function(b){
      b.onclick=function(){
        var ok=b.hasAttribute('data-plan-ok'), id=b.getAttribute(ok?'data-plan-ok':'data-plan-cancel');
        Array.prototype.forEach.call(b.parentNode.querySelectorAll('button'), function(x){ x.disabled=true; });
        b.textContent='กำลังบันทึก…';
        api('POST','/plans/'+encodeURIComponent(id)+'/'+(ok?'confirm':'cancel'), { room:S.room }).then(function(r){
          toast(ok ? 'สร้างงานย่อย '+((r.created&&r.created.length)||r.created||0)+' งานแล้ว' : 'ยกเลิกแผนแล้ว');
          after();
        }).catch(function(e){ toast(busyMsg(e), true); after(); });
      };
    });
  }

  // ═══════════ ล็อบบี้ ═══════════
  function renderLobby(){
    if(S.room==='*') return renderOverview();
    return ensureRoom().then(function(){ return api('GET','/lobby'+q()); }).then(function(d){
      if(H.view()!=='aiofc') return;
      S.rooms=d.rooms;
      var c=d.cost||{}, pct=c.budgetThb?Math.min(100, Math.round(c.spentThb/c.budgetThb*100)):0;
      var b=d.board||{};
      var tiles=[['intake','รับเข้า','t-blue'],['doing','กำลังทำ','t-purple'],['waiting','รออนุมัติ','t-orange'],['done','เสร็จวันนี้','t-green']].map(function(t){
        return '<div class="aio-tile '+t[2]+'"><div class="v">'+(b[t[0]]||0)+'</div><div class="l">'+t[1]+'</div></div>'; }).join('');
      var desks=(d.desks||[]).map(function(x){
        return '<button class="aio-desk" data-desk="'+esc(x.id)+'" style="--c:'+esc(x.color||COLOR[x.id])+'">'+
          '<div class="aio-bub'+(x.bubble?'':' idle')+'">'+(x.bubble?esc(x.bubble)+(x.bubbleStatus?'<small>'+esc(x.bubbleStatus)+'</small>':''):'ว่าง รอรับงานค่ะ')+'</div>'+
          '<div class="aio-stage"><img class="aio-ch" src="'+img(x.id,true)+'" alt=""><img class="aio-tb" src="'+H.base+'desk.webp?v='+H.v+'" alt=""></div>'+
          '<span class="aio-st st-'+esc(x.status)+'">'+esc(ST[x.status]||x.status)+'</span>'+
          '<div class="aio-nm">'+esc(x.role)+'</div><div class="aio-id">'+esc(x.id)+' · งานค้าง '+(x.open||0)+'</div>'+
          '<div class="aio-duty">'+esc(x.duty)+'</div></button>';
      }).join('');
      var quick=(d.quick||[]).map(function(x){ return '<button class="aio-q" data-q="'+esc(x.id)+'">'+esc(x.label)+'</button>'; }).join('');
      var ap=d.approvals||{};
      H.main.innerHTML='<div class="aio aio-lobby">'+
        '<section class="aio-hero" style="background-image:url('+H.base+'office-bg.webp?v='+H.v+')">'+
          '<div class="aio-hero-tx"><h2>ห้องทำงาน AI</h2><p>ทีม AI 6 โต๊ะ ร่างงานให้พี่ · พี่เป็นคนอนุมัติทุกชิ้น</p></div>'+
          '<div class="aio-hero-side">'+roomPicker(d.rooms, true)+
            '<div class="aio-cost"><div class="aio-cost-t">ค่า AI วันนี้ <b>'+money(c.spentThb)+'</b> / '+money(c.budgetThb)+' บาท</div>'+
            '<div class="aio-bar"><i style="width:'+pct+'%"></i></div>'+
            '<div class="aio-cost-s">'+(c.perDoneThb!=null?'เฉลี่ย '+money(c.perDoneThb)+' บาท/งานที่เสร็จ':'ยังไม่มีงานเสร็จวันนี้')+'</div></div>'+
          '</div></section>'+
        '<button class="aio-sign" id="aioSign"><span class="pen">✍️</span><span>รอพี่เซ็น <b>'+(ap.pending||0)+'</b> งาน</span>'+
          (ap.demo?'<em>ข้อมูลตัวอย่าง</em>':'')+'<span class="go">เปิดห้องอนุมัติ ›</span></button>'+
        '<div class="aio-tiles">'+tiles+'</div>'+
        '<h3 class="aio-h">โต๊ะทำงาน</h3><div class="aio-desks">'+desks+'</div>'+
        '<section class="card aio-mgr">'+
          '<div class="aio-mgr-h"><img src="'+img('MGR-001',true)+'" alt=""><div><b>สั่งงานหัวหน้า AI</b><span>ถามสถานะ = ตอบจากข้อมูลทันที · สั่งงาน = หัวหน้าเสนอแผนให้พี่ยืนยันก่อน</span></div></div>'+
          '<div id="aioMgrOut" class="aio-out">'+S.mgrOut+'</div>'+
          '<div class="aio-cmd"><div class="aio-qs">'+quick+'</div>'+
          '<div class="aio-in"><textarea id="aioCmd" rows="2" maxlength="4000" placeholder="เช่น ปิดเงินเดือน ต.ค. ของห้องนี้ให้ทันวันที่ 25"></textarea>'+
          '<button class="aio-btn" id="aioCmdGo">ส่งให้หัวหน้า</button></div></div>'+
        '</section></div>';
      bindRoom();
      $('aioSign').onclick=function(){ H.go('aiappr'); };
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-desk'), function(el){
        el.onclick=function(){ S.desk=el.getAttribute('data-desk'); H.go('aidesk'); };
      });
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-q'), function(el){
        el.onclick=function(){ mgrAsk({ quick:el.getAttribute('data-q') }, el.textContent); };
      });
      $('aioCmdGo').onclick=function(){
        var t=$('aioCmd').value.trim(); if(!t){ $('aioCmd').focus(); return; }
        mgrAsk({ text:t }, t);
      };
      bindPlans($('aioMgrOut'), function(){ S.mgrOut=''; renderLobby(); });
    });
  }
  /* คำถาม/คำสั่งในล็อบบี้ = คุยกับโต๊ะ MGR-001 (ข้อความเก็บในเธรดเดียวกับหน้าโต๊ะหัวหน้า) */
  function mgrAsk(body, label){
    var out=$('aioMgrOut'), go=$('aioCmdGo');
    body.room=S.room;
    out.innerHTML='<div class="aio-msg me"><div class="tx">'+esc(label)+'</div></div><div class="aio-typing"><i></i><i></i><i></i> หัวหน้า AI กำลังดู…</div>';
    if(out.scrollIntoView) out.scrollIntoView({ block:'start', behavior:'smooth' });
    if(go) go.disabled=true;
    api('POST','/desks/MGR-001/ask', body).then(function(r){
      var html='<div class="aio-msg me"><div class="tx">'+esc(label)+'</div></div>'+
        '<div class="aio-msg ai"><img src="'+img('MGR-001',true)+'" alt=""><div class="tx">'+esc(r.reply)+'<div class="aio-meta">'+badge(r.meta)+'</div></div></div>'+
        (r.plan?planCard(r.taskId, r.plan, 'plan_proposed'):'');
      S.mgrOut=html; out.innerHTML=html;
      if(out.scrollIntoView) out.scrollIntoView({ block:'start', behavior:'smooth' });   // มือถือ: คำตอบอยู่ท้ายหน้า เลื่อนไปให้เห็น
      if(body.text) $('aioCmd').value='';
      bindPlans(out, function(){ S.mgrOut=''; renderLobby(); });
    }).catch(function(e){
      out.innerHTML='<div class="aio-msg me"><div class="tx">'+esc(label)+'</div></div><div class="aio-warn">'+esc(busyMsg(e))+'</div>';
    }).then(function(){ if(go) go.disabled=false; });
  }

  // ═══════════ ภาพรวมทุกห้อง (spec §13 · คนดูรวมได้ · AI ทำงานทีละห้อง) ═══════════
  function renderOverview(){
    return api('GET','/overview').then(function(d){
      if(H.view()!=='aiofc' || S.room!=='*') return;
      S.rooms=d.rooms.map(function(r){ return { code:r.code, name:r.name }; });
      var c=d.cost||{}, pct=c.budgetThb?Math.min(100, Math.round(c.spentThb/c.budgetThb*100)):0, t=d.totals||{};
      var tiles=[[t.open,'งานค้างทุกห้อง','t-blue'],[t.blocked,'ติดปัญหา','t-orange'],[t.waiting,'รอพี่','t-purple'],[t.late,'เลยกำหนด','t-orange']].map(function(x){
        return '<div class="aio-tile '+x[2]+'"><div class="v">'+(x[0]||0)+'</div><div class="l">'+x[1]+'</div></div>'; }).join('');
      var rows=(d.rooms||[]).map(function(r,i){
        var warn=r.blocked||r.late;
        return '<tr class="aio-row" data-room="'+esc(r.code)+'"><td class="n">'+(i+1)+'</td><td><b>'+esc(r.name)+'</b><div class="aio-sub">'+esc(r.code)+'</div></td>'+
          '<td class="num">'+r.open+'</td><td class="num'+(r.blocked?' bad':'')+'">'+r.blocked+'</td><td class="num">'+r.waiting+'</td>'+
          '<td class="num hm">'+r.due7+'</td><td class="num'+(r.late?' bad':'')+'">'+r.late+'</td><td class="num hm">'+r.doneToday+'</td>'+
          '<td class="go">'+(warn?'<span class="aio-s s-blocked">ต้องดู</span>':'')+' ›</td></tr>'; }).join('');
      var items=(d.items||[]).map(function(x,i){
        return '<tr class="aio-row" data-room="'+esc(x.room)+'"><td class="n">'+(i+1)+'</td><td>'+esc(x.roomName)+'</td>'+
          '<td><b>'+esc(x.title)+'</b></td><td class="hm"><span class="aio-dot" style="background:'+(COLOR[x.agent]||'#ccc')+'"></span>'+esc(ROLE[x.agent]||x.agent||'-')+'</td>'+
          '<td><span class="aio-s s-'+esc(x.status)+'">'+esc(x.statusTh)+'</span></td><td'+(x.late?' class="bad"':'')+'>'+thDate(x.due_date)+(x.late?' · เลย':'')+'</td></tr>'; }).join('');
      var quick=(d.quick||[]).map(function(x){ return '<button class="aio-q" data-q="'+esc(x.id)+'">'+esc(x.label)+'</button>'; }).join('');
      var ap=d.approvals||{};
      // โต๊ะ 6 ตัว ยอดรวมทุกห้อง · กดแล้วเห็นงานของโต๊ะนั้นจากทุกห้อง (คุย/สั่งงานต้องเข้าโต๊ะในห้องใดห้องหนึ่ง)
      var desks=(d.desks||[]).map(function(x){
        return '<button class="aio-desk'+(S.allDesk===x.id?' on':'')+'" data-desk="'+esc(x.id)+'" style="--c:'+esc(x.color||COLOR[x.id])+'">'+
          '<div class="aio-bub'+(x.open?'':' idle')+'">'+(x.open?'ค้าง '+x.open+' งาน ใน '+x.rooms+' ห้อง'+
            (x.blocked||x.waiting?'<small>'+(x.blocked?'ติดปัญหา '+x.blocked:'')+(x.blocked&&x.waiting?' · ':'')+(x.waiting?'รอพี่ '+x.waiting:'')+'</small>':''):'ว่างทุกห้องค่ะ')+'</div>'+
          '<div class="aio-stage"><img class="aio-ch" src="'+img(x.id,true)+'" alt=""><img class="aio-tb" src="'+H.base+'desk.webp?v='+H.v+'" alt=""></div>'+
          '<span class="aio-st st-'+esc(x.status)+'">'+esc(ST[x.status]||x.status)+'</span>'+
          '<div class="aio-nm">'+esc(x.role)+'</div><div class="aio-id">'+esc(x.id)+' · ค้างรวม '+(x.open||0)+'</div>'+
          '<div class="aio-duty">'+esc(x.duty)+'</div></button>';
      }).join('');
      H.main.innerHTML='<div class="aio aio-lobby aio-all">'+
        '<section class="aio-hero" style="background-image:url('+H.base+'office-bg.webp?v='+H.v+')">'+
          '<div class="aio-hero-tx"><h2>ห้องทำงาน AI · ทุกห้อง</h2><p>ดูรวมได้ทุกห้อง · สั่งงานให้เลือกห้องก่อน</p></div>'+
          '<div class="aio-hero-side">'+roomPicker(S.rooms, true)+
            '<div class="aio-cost"><div class="aio-cost-t">ค่า AI วันนี้ <b>'+money(c.spentThb)+'</b> / '+money(c.budgetThb)+' บาท</div>'+
            '<div class="aio-bar"><i style="width:'+pct+'%"></i></div><div class="aio-cost-s">รวมทุกห้อง · งานเสร็จวันนี้ '+(t.doneToday||0)+' งาน</div></div>'+
          '</div></section>'+
        '<button class="aio-sign" id="aioSign"><span class="pen">✍️</span><span>รอพี่เซ็น <b>'+(ap.pending||0)+'</b> งาน</span>'+
          (ap.demo?'<em>ข้อมูลตัวอย่าง</em>':'')+'<span class="go">เปิดห้องอนุมัติ ›</span></button>'+
        '<div class="aio-tiles">'+tiles+'</div>'+
        '<h3 class="aio-h">โต๊ะทำงาน <span class="aio-sub">รวมทุกห้อง · กดโต๊ะเพื่อดูงานของโต๊ะนั้นจากทุกห้อง</span></h3><div class="aio-desks">'+desks+'</div>'+
        '<div id="aioAllDesk"></div>'+
        '<section class="card aio-sec"><div class="aio-lbl big">สรุปแยกห้อง <span class="aio-sub">กดแถวเพื่อเข้าห้องนั้น</span></div>'+
          '<div class="aio-tw"><table class="aio-t"><thead><tr><th class="n">#</th><th>ห้อง</th><th class="num">ค้าง</th><th class="num">ติดปัญหา</th><th class="num">รอพี่</th>'+
          '<th class="num hm">ถึงกำหนด 7 วัน</th><th class="num">เลยกำหนด</th><th class="num hm">เสร็จวันนี้</th><th></th></tr></thead><tbody>'+
          (rows||'<tr><td colspan="9" class="aio-empty">ตั๋วนี้ยังไม่มีห้อง</td></tr>')+'</tbody></table></div></section>'+
        '<section class="card aio-sec"><div class="aio-lbl big">งานที่ต้องดู <span class="aio-sub">ติดปัญหา · ถึงกำหนดใน 7 วัน · เลยกำหนด</span></div>'+
          '<div class="aio-tw"><table class="aio-t"><thead><tr><th class="n">#</th><th>ห้อง</th><th>งาน</th><th class="hm">โต๊ะ</th><th>สถานะ</th><th>กำหนด</th></tr></thead><tbody>'+
          (items||'<tr><td colspan="6" class="aio-empty">ไม่มีงานติดปัญหาหรือใกล้ถึงกำหนดค่ะ</td></tr>')+'</tbody></table></div></section>'+
        '<section class="card aio-mgr">'+
          '<div class="aio-mgr-h"><img src="'+img('MGR-001',true)+'" alt=""><div><b>ถามหัวหน้า AI (ทุกห้อง)</b><span>ปุ่มด้านล่างตอบรวมทุกห้องจากข้อมูล ไม่เสียเงิน · จะสั่งงานให้เลือกห้องก่อน</span></div></div>'+
          '<div id="aioMgrOut" class="aio-out">'+S.mgrOut+'</div>'+
          '<div class="aio-cmd"><div class="aio-qs">'+quick+'</div><div class="aio-all-note">สั่งงานใหม่: เลือกห้องที่ช่อง "ห้อง" ด้านบนก่อนค่ะ</div></div>'+
        '</section></div>';
      bindRoom();
      $('aioSign').onclick=function(){ H.go('aiappr'); };
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-row'), function(el){
        el.onclick=function(){ setRoom(el.getAttribute('data-room')); renderLobby().catch(fail); window.scrollTo(0,0); };
      });
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-q'), function(el){
        el.onclick=function(){ allAsk(el.getAttribute('data-q'), el.textContent); };
      });
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-desk'), function(el){
        el.onclick=function(){ allDesk(el.getAttribute('data-desk')); };
      });
      if(S.allDesk) allDesk(S.allDesk, true);
    });
  }
  /* งานของโต๊ะเดียวจากทุกห้อง · กดงาน/ปุ่มห้อง = เปิดโต๊ะนั้นในห้องนั้น (กลับล็อบบี้แล้วกลับมาทุกห้อง) */
  function allDesk(id, keep){
    var box=$('aioAllDesk'); if(!box) return;
    if(S.allDesk===id && !keep){ S.allDesk=''; box.innerHTML=''; mark(); return; }
    S.allDesk=id; mark();
    box.innerHTML='<section class="card aio-sec aio-alldesk"><div class="aio-typing"><i></i><i></i><i></i> กำลังดูงานของโต๊ะ '+esc(ROLE[id]||id)+'…</div></section>';
    api('GET','/overview/desks/'+encodeURIComponent(id)).then(function(d){
      if(S.allDesk!==id || !$('aioAllDesk')) return;
      var rows=(d.items||[]).map(function(x,i){
        return '<tr class="aio-row" data-room="'+esc(x.room)+'"><td class="n">'+(i+1)+'</td><td>'+esc(x.roomName)+'</td><td><b>'+esc(x.title)+'</b></td>'+
          '<td><span class="aio-s s-'+esc(x.status)+'">'+esc(x.statusTh)+'</span></td><td'+(x.late?' class="bad"':'')+'>'+thDate(x.due_date)+(x.late?' · เลย':'')+'</td><td class="go">›</td></tr>'; }).join('');
      var rooms=(d.rooms||[]).map(function(r){ return '<button class="aio-btn ghost sm" data-room="'+esc(r.code)+'">'+esc(r.name)+'</button>'; }).join('');
      $('aioAllDesk').innerHTML='<section class="card aio-sec aio-alldesk" style="--c:'+(COLOR[id]||'#7c5cf0')+'">'+
        '<div class="aio-alldesk-h"><img src="'+img(id,true)+'" alt=""><div><b>'+esc(d.role||ROLE[id])+' · งานค้างทุกห้อง '+(d.items||[]).length+' งาน</b>'+
          '<span>กดงานเพื่อเข้าโต๊ะนี้ในห้องนั้น · คุยและสั่งงานได้ในห้องเท่านั้น</span></div><button class="aio-x" id="aioAllDeskX" aria-label="ปิด">×</button></div>'+
        '<div class="aio-tw"><table class="aio-t"><thead><tr><th class="n">#</th><th>ห้อง</th><th>งาน</th><th>สถานะ</th><th>กำหนด</th><th></th></tr></thead><tbody>'+
          (rows||'<tr><td colspan="6" class="aio-empty">โต๊ะนี้ไม่มีงานค้างในห้องไหนเลยค่ะ</td></tr>')+'</tbody></table></div>'+
        '<div class="aio-alldesk-go"><span>เปิดโต๊ะนี้ในห้อง</span>'+rooms+'</div></section>';
      $('aioAllDeskX').onclick=function(){ allDesk(id); };
      Array.prototype.forEach.call($('aioAllDesk').querySelectorAll('[data-room]'), function(el){
        el.onclick=function(){ openDeskIn(id, el.getAttribute('data-room')); };
      });
      if(!keep){ var sec=$('aioAllDesk'); if(sec.scrollIntoView) sec.scrollIntoView({ block:'nearest', behavior:'smooth' }); }
    }).catch(function(e){
      if($('aioAllDesk')) $('aioAllDesk').innerHTML='<div class="aio-warn">'+esc(busyMsg(e))+'</div>';
    });
    function mark(){
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-desk'), function(el){ el.classList.toggle('on', el.getAttribute('data-desk')===S.allDesk); });
    }
  }
  function openDeskIn(id, room){
    setRoom(room); S.backAll=true; S.desk=id;
    H.go('aidesk');
  }
  function allAsk(quick, label){
    var out=$('aioMgrOut');
    out.innerHTML='<div class="aio-msg me"><div class="tx">'+esc(label)+' (ทุกห้อง)</div></div><div class="aio-typing"><i></i><i></i><i></i> หัวหน้า AI กำลังดู…</div>';
    if(out.scrollIntoView) out.scrollIntoView({ block:'start', behavior:'smooth' });
    api('POST','/overview/ask', { quick:quick }).then(function(r){
      var html='<div class="aio-msg me"><div class="tx">'+esc(label)+' (ทุกห้อง)</div></div>'+
        '<div class="aio-msg ai"><img src="'+img('MGR-001',true)+'" alt=""><div class="tx">'+esc(r.reply)+'<div class="aio-meta">'+badge(r.meta)+'</div></div></div>';
      S.mgrOut=html; out.innerHTML=html;
    }).catch(function(e){
      out.innerHTML='<div class="aio-warn">'+esc(busyMsg(e))+'</div>';
    });
  }

  // ═══════════ หน้าโต๊ะ ═══════════
  function renderDesk(keepInput){
    if(DESKS.indexOf(S.desk)<0) S.desk='MGR-001';
    var id=S.desk;
    return concreteRoom().then(function(){ return api('GET','/desks/'+id+q()); }).then(function(d){
      if(H.view()!=='aidesk' || S.desk!==id) return;
      var k=d.desk, st=d.stats||{};
      var tabs=DESKS.map(function(x){
        return '<button class="aio-tab'+(x===id?' on':'')+'" data-desk="'+x+'" style="--c:'+COLOR[x]+'"><img src="'+img(x,true)+'" alt=""><span>'+esc(ROLE[x])+'</span></button>'; }).join('');
      var msgs=(d.messages||[]).map(function(m){
        if(m.mine) return '<div class="aio-msg me"><div class="tx">'+esc(m.content)+'</div></div>';
        var at=m.attachments||{}, plan=at.type==='plan' && d.plans && d.plans[at.taskId];
        return '<div class="aio-msg ai"><img src="'+img(id,true)+'" alt=""><div class="tx">'+esc(m.content)+
          '<div class="aio-meta">'+badge(m)+'</div></div></div>'+(plan?planCard(at.taskId, plan.plan, plan.status):'');
      }).join('') || '<div class="aio-hello">ยังไม่มีข้อความ · ลองกดปุ่มคำถามด้านล่าง หรือพิมพ์ถาม '+esc(k.role)+' ได้เลยค่ะ</div>';
      var queue=(d.queue||[]).map(function(t,i){
        return '<tr><td class="n">'+(i+1)+'</td><td><b>'+esc(t.title)+'</b>'+(t.parent_task_id?'<div class="aio-sub">งานย่อย</div>':'')+'</td>'+
          '<td><span class="aio-s s-'+esc(t.status)+'">'+esc(t.statusTh)+'</span></td><td>'+thDate(t.due_date)+'</td></tr>'; }).join('');
      var tools=(k.tools||[]).map(function(t){ return '<span class="aio-chip">'+esc(TOOL[t]||t)+'</span>'; }).join('');
      var quick=(d.quick||[]).map(function(x){ return '<button class="aio-q" data-q="'+esc(x.id)+'">'+esc(x.label)+'</button>'; }).join('');
      var old=keepInput && $('aioAsk') ? $('aioAsk').value : '';
      H.main.innerHTML='<div class="aio aio-dk" style="--c:'+esc(k.color)+'">'+
        '<div class="aio-top"><button class="aio-back" id="aioBack">‹ ล็อบบี้</button>'+roomPicker(d.rooms)+'</div>'+
        '<nav class="aio-tabs">'+tabs+'</nav>'+
        '<div class="aio-dk-grid">'+
          '<aside class="card aio-prof">'+
            '<div class="aio-prof-stage"><span class="aio-st st-'+esc(k.status)+'">'+esc(ST[k.status]||k.status)+'</span>'+
              '<img class="aio-full" src="'+img(id,false)+'" alt=""><img class="aio-tb" src="'+H.base+'desk.webp?v='+H.v+'" alt=""></div>'+
            '<div class="aio-nm">'+esc(k.role)+'</div><div class="aio-id">'+esc(k.id)+'</div><div class="aio-duty">'+esc(k.duty)+'</div>'+
            '<div class="aio-stats"><div><b>'+(st.open||0)+'</b><span>งานค้าง</span></div><div><b>'+(st.done7||0)+'</b><span>เสร็จ 7 วัน</span></div>'+
              '<div><b>'+money(st.costTodayThb)+'</b><span>บาท วันนี้</span></div></div>'+
            '<div class="aio-lbl">เครื่องมือที่ใช้ได้</div><div class="aio-chips">'+tools+'</div>'+
            '<div class="aio-lbl">สมอง AI</div><div class="aio-chips"><span class="aio-chip">'+esc(modelName(k.model))+' · คิด'+esc(EFFORT[k.effort]||k.effort)+'</span></div>'+
            (k.note?'<div class="aio-note">'+esc(k.note)+'</div>':'')+
          '</aside>'+
          '<section class="card aio-chat">'+
            '<div class="aio-chat-h"><img src="'+img(id,true)+'" alt=""><div><b>คุยกับ'+esc(k.role)+'</b><span>ห้อง '+esc((d.room&&d.room.name)||S.room)+'</span></div></div>'+
            '<div class="aio-msgs" id="aioMsgs">'+msgs+'</div>'+
            '<div class="aio-cmd"><div class="aio-qs">'+quick+'</div>'+
            '<div class="aio-in"><textarea id="aioAsk" rows="2" maxlength="4000" placeholder="'+(id==='MGR-001'?'ถามสถานะ หรือสั่งงาน — หัวหน้าจะเสนอแผนให้พี่ยืนยันก่อน':'พิมพ์ถาม'+esc(k.role))+'"></textarea>'+
            '<button class="aio-btn" id="aioAskGo">ส่ง</button></div></div>'+
          '</section>'+
          '<aside class="card aio-queue"><div class="aio-lbl big">คิวงานของโต๊ะนี้</div>'+
            '<div class="aio-tw"><table class="aio-t"><thead><tr><th class="n">#</th><th>งาน</th><th>สถานะ</th><th>กำหนด</th></tr></thead><tbody>'+
            (queue||'<tr><td colspan="4" class="aio-empty">ยังไม่มีงานในคิว</td></tr>')+'</tbody></table></div></aside>'+
        '</div></div>';
      if(old) $('aioAsk').value=old;
      var box=$('aioMsgs'); box.scrollTop=box.scrollHeight;
      bindRoom();
      $('aioBack').onclick=backToLobby;
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-tab'), function(el){
        el.onclick=function(){ if(S.desk===el.getAttribute('data-desk')) return; S.desk=el.getAttribute('data-desk'); renderDesk().catch(fail); };
      });
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-chat .aio-q'), function(el){
        el.onclick=function(){ deskAsk({ quick:el.getAttribute('data-q') }, el.textContent); };
      });
      $('aioAskGo').onclick=function(){
        var t=$('aioAsk').value.trim(); if(!t){ $('aioAsk').focus(); return; }
        deskAsk({ text:t }, t);
      };
      bindPlans(box, function(){ renderDesk().catch(fail); });
    });
  }
  function deskAsk(body, label){
    var box=$('aioMsgs'), go=$('aioAskGo');
    body.room=S.room;
    var hello=box.querySelector('.aio-hello'); if(hello) hello.parentNode.removeChild(hello);
    box.insertAdjacentHTML('beforeend','<div class="aio-msg me"><div class="tx">'+esc(label)+'</div></div><div class="aio-typing" id="aioTyping"><i></i><i></i><i></i> กำลังดู…</div>');
    box.scrollTop=box.scrollHeight;
    go.disabled=true;
    api('POST','/desks/'+S.desk+'/ask', body).then(function(){
      if(body.text) $('aioAsk').value='';
      return renderDesk(true);
    }).catch(function(e){
      var t=$('aioTyping'); if(t) t.parentNode.removeChild(t);
      box.insertAdjacentHTML('beforeend','<div class="aio-warn">'+esc(busyMsg(e))+'</div>');
      box.scrollTop=box.scrollHeight;
      go.disabled=false;
    });
  }

  // ═══════════ ห้องอนุมัติ (เฟส 1 = ข้อมูลตัวอย่าง) ═══════════
  function renderAppr(){
    return concreteRoom().then(function(){ return api('GET','/approvals'+q()); }).then(function(d){
      if(H.view()!=='aiappr') return;
      var items=d.items||[];
      var cur=items.filter(function(x){ return x.id===S.appr; })[0];
      var wide=window.matchMedia && window.matchMedia('(min-width:900px)').matches;
      if(!cur && wide) cur=items[0];   // จอคอม = เปิดใบแรกให้เลย · มือถือ = เริ่มที่รายการ
      var list=items.map(function(x,i){
        return '<button class="aio-ap-i'+(cur&&cur.id===x.id?' on':'')+'" data-ap="'+esc(x.id)+'" style="--c:'+(COLOR[x.agent]||'#ccc')+'">'+
          '<span class="n">'+(i+1)+'</span><img src="'+img(x.agent,true)+'" alt="">'+
          '<span class="tx"><b>'+esc(x.title)+'</b><small>'+esc(ROLE[x.agent]||x.agent)+' · '+esc(x.client)+'</small></span>'+
          '<span class="aio-au a-'+esc(x.audit)+'">'+(x.audit==='pass'?'ตรวจผ่าน':'ต้องดู')+'</span></button>'; }).join('') ||
        '<div class="aio-empty">ไม่มีงานรอพี่เซ็นค่ะ</div>';
      var det='';
      if(cur){
        var rows=(cur.checks||[]).map(function(c,i){
          return '<tr><td class="n">'+(i+1)+'</td><td>'+esc(c.item)+'</td><td class="num">'+esc(c.draft)+'</td><td class="num">'+esc(c.source)+'</td>'+
            '<td><span class="aio-au a-'+esc(c.result)+'">'+(c.result==='pass'?'ตรง':'ไม่ตรง')+'</span></td></tr>'; }).join('');
        det='<button class="aio-back aio-ap-back" id="aioApBack">‹ รายการ</button>'+
          '<div class="aio-ap-hd"><img src="'+img(cur.agent,true)+'" alt=""><div><h3>'+esc(cur.title)+'</h3>'+
          '<span>ร่างโดย '+esc(ROLE[cur.agent]||cur.agent)+' · จากงาน '+esc(cur.fromTask)+' · '+esc(cur.client)+'</span></div></div>'+
          '<div class="aio-chips"><span class="aio-risk r'+(+cur.risk||3)+'">ระดับ '+esc(cur.risk)+' · '+esc(RISK[cur.risk]||'')+'</span>'+
          '<span class="aio-au a-'+esc(cur.audit)+'">ผู้ตรวจสอบ AI: '+(cur.audit==='pass'?'ผ่านทุกข้อ':'มีข้อต้องดู')+'</span></div>'+
          '<div class="aio-lbl">ผลตรวจเทียบข้อมูลต้นทาง</div>'+
          '<div class="aio-tw"><table class="aio-t"><thead><tr><th class="n">#</th><th>รายการ</th><th class="num">ในร่าง</th><th class="num">ต้นทาง</th><th>ผล</th></tr></thead><tbody>'+
          (rows||'<tr><td colspan="5" class="aio-empty">ไม่มีข้อตรวจ</td></tr>')+'</tbody></table></div>'+
          '<div class="aio-lbl">ร่างงาน</div><div class="aio-draft">'+esc(cur.draft)+'</div>'+
          '<div class="aio-ap-act"><button class="aio-btn ghost" data-dec="reject">ตีกลับ</button><button class="aio-btn" data-dec="approve">อนุมัติ</button></div>';
      }
      H.main.innerHTML='<div class="aio aio-ap'+(S.appr?' sel':'')+'">'+
        '<div class="aio-top"><button class="aio-back" id="aioBack">‹ ล็อบบี้</button><span class="aio-chip">'+items.length+' งานรอพี่เซ็น</span></div>'+
        (d.demo?'<div class="aio-demo">ข้อมูลตัวอย่าง (เฟส 1) — ปุ่มอนุมัติ/ตีกลับยังไม่สั่งงานจริง ทำไว้ให้พี่ดูหน้าตาก่อนค่ะ</div>':'')+
        '<div class="aio-ap-grid"><div class="card aio-ap-list">'+list+'</div>'+
        '<div class="card aio-ap-det">'+(det||'<div class="aio-empty">เลือกงานทางซ้ายเพื่อดูรายละเอียด</div>')+'</div></div></div>';
      $('aioBack').onclick=function(){ S.appr=''; backToLobby(); };
      var bk=$('aioApBack'); if(bk) bk.onclick=function(){ S.appr=''; renderAppr().catch(fail); };
      Array.prototype.forEach.call(H.main.querySelectorAll('.aio-ap-i'), function(el){
        el.onclick=function(){ S.appr=el.getAttribute('data-ap'); renderAppr().catch(fail); window.scrollTo(0,0); };
      });
      Array.prototype.forEach.call(H.main.querySelectorAll('[data-dec]'), function(b){
        b.onclick=function(){
          b.disabled=true;
          api('POST','/approvals/'+encodeURIComponent(cur.id)+'/decide', { room:S.room, decision:b.getAttribute('data-dec') })
            .then(function(r){ toast(r.message||'บันทึกแล้ว'); })
            .catch(function(e){ toast(busyMsg(e), true); })
            .then(function(){ b.disabled=false; });
        };
      });
    });
  }

  function render(view, host){
    H=host;
    if(!S.room) S.room=ss('aio.room')||'';
    var p = view==='aidesk' ? renderDesk() : view==='aiappr' ? renderAppr() : renderLobby();
    return p.catch(function(e){
      // ห้องที่จำไว้ไม่อยู่ในตั๋วแล้ว → ล้างแล้วลองใหม่ครั้งเดียว
      if(S.room && /เข้าห้อง/.test(e.message||'')){ S.room=''; ss('aio.room',null); return render(view, host); }
      fail(e);
    });
  }
  window.AIO={ render:render, open:function(id){ if(DESKS.indexOf(id)>=0) S.desk=id; } };
})();
