// Require a saved wallet or bounce to setup
const wallet = requireWalletOrRedirect(); if (!wallet) throw new Error('No wallet');

const logoutBtn  = document.getElementById('logoutBtn');
const btnRefresh = document.getElementById('btnTxRefresh');
const tbody      = document.getElementById('txTbody');
const errBox     = document.getElementById('txError');
const typeSelect = document.getElementById('typeFilterSelect');

logoutBtn.onclick = () => { clearWallet(); location.href = 'wallet-creation.html'; };
btnRefresh.onclick = () => loadTx();
typeSelect.onchange = () => render(window.__txCache || []);

// --- Helpers ---
function formatWeiToEth6(weiVal) {
  const s = String(weiVal ?? '0');
  const neg = s.startsWith('-');
  const t = neg ? s.slice(1) : s;

  const whole = t.length > 18 ? t.slice(0, -18) : '0';
  const fracFull = t.length > 18 ? t.slice(-18) : t.padStart(18, '0');
  const frac6 = fracFull.slice(0, 6);

  return (neg ? '-' : '') + whole + '.' + (frac6.replace(/0+$/, '') || '0');
}

function rowHtml(r) {
  const me = wallet.address.toLowerCase();
  const isSent = (r.sender || '').toLowerCase() === me;
  const peer = isSent ? r.recipient : r.sender;
  const eth = formatWeiToEth6(r.amount_wei ?? 0);
  const when = new Date((r.timestamp || 0) * 1000).toLocaleString();

  return `
    <tr>
      <td class="${isSent ? 'error' : 'success'}">${isSent ? 'Sent' : 'Received'}</td>
      <td class="mono" title="${peer || ''}">${peer || '-'}</td>
      <td>${eth}</td>
      <td>${when}</td>
    </tr>
  `;
}

function renderEmpty(msg = 'No transactions yet.') {
  tbody.innerHTML = `<tr><td colspan="4" class="notice">${msg}</td></tr>`;
}

function render(data) {
  if (!Array.isArray(data) || data.length === 0) return renderEmpty();

  const me = wallet.address.toLowerCase();
  const filter = typeSelect.value;

  let filtered = data;
  if (filter === 'sent') {
    filtered = data.filter(r => (r.sender || '').toLowerCase() === me);
  } else if (filter === 'received') {
    filtered = data.filter(r => (r.recipient || '').toLowerCase() === me);
  }

  if (filtered.length === 0) return renderEmpty('No transactions for this filter.');

  filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  tbody.innerHTML = filtered.map(rowHtml).join('');
}

// --- Fetch & render ---
async function loadTx() {
  try {
    errBox.style.display = 'none';
    errBox.textContent = '';

    const url = `${API_BASE_URL}/tx/history?address=${wallet.address}`;
    const data = await getJSON(url);
    window.__txCache = data || [];
    render(window.__txCache);
  } catch (e) {
    console.error('Tx load failed:', e);
    renderEmpty('Could not load transactions.');
    errBox.textContent = e.message || 'Network error';
    errBox.style.display = 'block';
  }
}

// Initial load
loadTx();
