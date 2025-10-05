
  const API_BASE_URL = 'http://127.0.0.1:8000/api';


  function saveWallet(w) { localStorage.setItem('wallet', JSON.stringify(w)); }
  function loadWallet()  { try { return JSON.parse(localStorage.getItem('wallet')); } catch(e){ return null; } }
  function clearWallet() { localStorage.removeItem('wallet'); }

  // ==== UI helpers ====
  function fmtAddr(a){ return a ? (a.slice(0,6)+'...'+a.slice(-4)) : ''; }
  function toFixed(num, d=6){ return Number(num ?? 0).toFixed(d); }

  // ==== HTTP helpers ====
  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async function postJSON(url, bodyObj) {
    const r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(bodyObj || {})
    });
    if (!r.ok) {
      let msg = 'Request failed';
      try { const e = await r.json(); msg = e.error || e.message || msg; } catch {}
      throw new Error(msg);
    }
    return await r.json();
  }

  function requireWalletOrRedirect() {
    const w = loadWallet();
    if (!w || !w.address) { window.location.href = 'wallet-creation.html'; return null; }
    return w;
  }
