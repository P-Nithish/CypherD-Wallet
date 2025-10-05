// Require a saved wallet or bounce to setup
const wallet = requireWalletOrRedirect(); if (!wallet) throw new Error('No wallet');

const logoutBtn   = document.getElementById('logoutBtn');
const scopeSelect = document.getElementById('scopeSelect');
const btnRefresh  = document.getElementById('btnTxRefresh');
const tbody       = document.getElementById('txTbody');
const errBox      = document.getElementById('txError');

logoutBtn.onclick = () => { clearWallet(); location.href = 'wallet-creation.html'; };
btnRefresh.onclick = () => loadTx();
scopeSelect.onchange = () => loadTx();

// --- Helpers ---
function formatWeiToEth6(weiVal) {
  // Accept number/string/BigInt, render to 6 decimals without precision loss
  const s = String(weiVal);
  const neg = s.startsWith('-');
  const t = neg ? s.slice(1) : s;

  const whole = t.length > 18 ? t.slice(0, -18) : '0';
  const fracFull = t.length > 18 ? t.slice(-18) : t.padStart(18, '0');
  const frac6 = fracFull.slice(0, 6); // display 6 decimals

  return (neg ? '-' : '') + whole + '.' + frac6.replace(/0+$/, '') || '0';
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

// --- Fetch & render ---
async function loadTx() {
  try {
    errBox.style.display = 'none';
    errBox.textContent = '';

    // mine (filtered by my address) or all
    const scope = scopeSelect.value;
    const url = scope === 'all'
      ? `${API_BASE_URL}/tx/history?scope=all`
      : `${API_BASE_URL}/tx/history?address=${wallet.address}`;

    const data = await getJSON(url);
    if (!Array.isArray(data) || data.length === 0) {
      renderEmpty();
      return;
    }

    // sort by newest (backend already does, but keep it safe)
    data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    tbody.innerHTML = data.map(rowHtml).join('');
  } catch (e) {
    console.error('Tx load failed:', e);
    renderEmpty('Could not load transactions.');
    errBox.textContent = (e && e.message) ? e.message : 'Network error';
    errBox.style.display = 'block';
  }
}

// Initial load
loadTx();
