/* yd-auth.js — บัตรผ่านของหน้าเว็บยินดี (ใช้ร่วมทุกหน้า · spec docs/spec-web-login.md §3 · 4 ต.ค. 2569)
 *
 * หน้าเว็บทุกหน้าอยู่ origin เดียวกัน (GitHub Pages) → บัตรที่ได้จากหน้าไหนก็ใช้ต่อได้ทุกหน้า
 *
 * ใช้:
 *   YDAuth.ensureLine(lineUid, idToken, call)  → Promise<tk>  (call = ฟังก์ชันยิงคำขอของหน้านั้น เช่น jsonp)
 *   YDAuth.attach(params)                      → params + tk  (เรียกในตัวยิงคำขอจุดเดียว)
 *   YDAuth.clear()                             → ทิ้งบัตร (ออกจากระบบ / หลังบ้านบอกบัตรใช้ไม่ได้)
 *   YDAuth.isAuthFail(resp)                    → หลังบ้านตอบว่าต้องล็อกอินใหม่
 *
 * ⚠️ localStorage อาจถูกปิด (โหมดส่วนตัว/บล็อกข้อมูลเว็บ) → เก็บในตัวแปรแทน ใช้ได้จนปิดหน้า
 */
(function () {
  var KEY = 'yd_tk';
  var CUR = null;

  function read() {
    if (CUR) return CUR;
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && o.tk && o.u && Number(o.x) > Date.now() + 60000) { CUR = o; return o; }
    } catch (e) {}
    return null;
  }
  function save(o) {
    CUR = o;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }
  function clear() {
    CUR = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  /**
   * มีบัตรของบัญชี LINE นี้อยู่แล้ว = ใช้ต่อ · ไม่มี/เป็นของคนอื่น = ขอใหม่ด้วย ID token
   * ขอบัตรไม่สำเร็จ → คืน '' (หน้าเว็บยังเปิดต่อได้ในโหมดบันทึก · โหมดเข้มจะเด้งให้ล็อกอินใหม่เอง)
   */
  function ensureLine(lineUid, idToken, call) {
    var o = read();
    if (o && o.u === lineUid) return Promise.resolve(o.tk);
    if (o) clear();   // บัตรของคนอื่น (สลับบัญชี LINE บนเครื่องเดียวกัน)
    if (!idToken || !lineUid) return Promise.resolve('');
    return Promise.resolve(call({ action: 'waLogin', idToken: idToken, uid: lineUid /* ไว้จดตอนขอบัตรไม่ผ่าน · ไม่ได้ใช้ตัดสิน */ })).then(function (r) {
      if (r && r.ok && r.tk && r.uid === lineUid) {
        save({ tk: r.tk, u: r.uid, k: 'line', x: Number(r.exp) || (Date.now() + 86400000) });
        return r.tk;
      }
      return '';
    }, function () { return ''; });
  }

  function attach(params) {
    var o = read();
    if (!o || !params || params.tk || params.action === 'waLogin') return params;
    var out = {};
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) out[k] = params[k];
    out.tk = o.tk;
    return out;
  }

  function isAuthFail(resp) { return !!(resp && resp.ok === false && resp.auth === true); }

  /** ส่งคำตอบผ่านตัวนี้ — หลังบ้านบอกบัตรใช้ไม่ได้ = ทิ้งบัตร (เปิดหน้าใหม่แล้วจะขอบัตรใหม่เอง) */
  function check(resp) { if (isAuthFail(resp)) clear(); return resp; }

  /** ensureLine แบบไม่ต้องมี idToken/uid ในมือ — ใช้กับหน้าเล็กที่ได้ profile จาก LIFF มาแล้ว */
  function ensureLiff(profile, call) {
    var idt = '';
    try { idt = (window.liff && liff.getIDToken && liff.getIDToken()) || ''; } catch (e) {}
    return ensureLine(profile && profile.userId, idt, call).then(function () { return profile; });
  }

  /** บัตรของคนที่เข้าด้วยอีเมล (null = ไม่มี/หมดอายุ/เป็นบัตร LINE) */
  function mail() { var o = read(); return (o && o.k === 'mail') ? o : null; }

  /** เก็บบัตรที่ได้จาก waMailVerify */
  function setMail(r) {
    if (r && r.tk && r.uid) save({ tk: r.tk, u: r.uid, k: 'mail', x: Number(r.exp) || (Date.now() + 86400000) });
  }

  window.YDAuth = {
    mail: mail, setMail: setMail,
    ensureLine: ensureLine, ensureLiff: ensureLiff, attach: attach, clear: clear, isAuthFail: isAuthFail, check: check,
    token: function () { var o = read(); return o ? o.tk : ''; },
    uid: function () { var o = read(); return o ? o.u : ''; }
  };
})();
