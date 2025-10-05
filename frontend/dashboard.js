const wallet = requireWalletOrRedirect(); if (!wallet) throw new Error('no wallet');

document.getElementById('logoutBtn').onclick = () => { clearWallet(); location.href='wallet-creation.html'; };
// 🔁 reload whole page on refresh
document.getElementById('btnRefresh').onclick = () => location.reload();

document.getElementById('addr').textContent = wallet.address;

async function loadBalance(){
  try{
    const r = await getJSON(`${API_BASE_URL}/wallet/balance?address=${wallet.address}`);
    const bal = r.balanceEth ?? 0;
    document.getElementById('bal').textContent = `${toFixed(bal,4)} ETH`;
    wallet.balance = bal; saveWallet(wallet);
  }catch(e){
    document.getElementById('bal').textContent = `${toFixed(wallet.balance||0,4)} ETH`;
    console.error(e);
  }
}

async function loadRecent(){
  try{
    const data = await getJSON(`${API_BASE_URL}/tx/history?address=${wallet.address}`);
    const tbody = document.querySelector('#txTable tbody');
    tbody.innerHTML='';
    if(!data.length){ document.getElementById('txEmpty').style.display='block'; return; }
    document.getElementById('txEmpty').style.display='none';
    // Show last 5 here (dashboard is a summary)
    data.slice(0,5).forEach(r=>{
      const sent = r.sender.toLowerCase()===wallet.address.toLowerCase();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="${sent?'error':'success'}">${sent?'Sent':'Received'}</td>
        <td class="mono">${sent? r.recipient : r.sender}</td>
        <td>${toFixed((r.amount_wei/1e18),6)}</td>
        <td>${new Date((r.timestamp||0)*1000).toLocaleString()}</td>`;
      tbody.appendChild(tr);
    });
  }catch(e){ console.error(e); }
}

loadBalance();
loadRecent();
