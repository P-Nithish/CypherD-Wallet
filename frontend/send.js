const wallet = requireWalletOrRedirect(); if (!wallet) throw new Error('No wallet');

document.getElementById('logoutBtn').onclick = () => { clearWallet(); location.href='wallet-creation.html'; };
document.getElementById('fromAddr').textContent = wallet.address;
document.getElementById('fromBal').textContent  = `${toFixed(wallet.balance||0,4)} ETH`;

const elTo   = document.getElementById('to');
const elAmt  = document.getElementById('amount');
const elCur  = document.getElementById('currency');
const elConv = document.getElementById('conv');
const elErr  = document.getElementById('err');

const modal   = document.getElementById('modal');
const timerBar= document.getElementById('timerBar');
const btnPrepare = document.getElementById('btnPrepare');
const btnCancel  = document.getElementById('btnCancel');
const btnConfirm = document.getElementById('btnConfirm');

const apprAmount = document.getElementById('apprAmount');
const apprUsd    = document.getElementById('apprUsd');
const apprTo     = document.getElementById('apprTo');
const apprFrom   = document.getElementById('apprFrom');
const apprNonce  = document.getElementById('apprNonce');
const apprExp    = document.getElementById('apprExp');

let approve = null;
let timerId = null;

function isAddress(a){return (window.ethers?.isAddress?.(a) || window.ethers?.utils?.isAddress?.(a) || /^0x[a-fA-F0-9]{40}$/.test(a));}

elAmt.addEventListener('input', updateHint);
elCur.addEventListener('change', updateHint);
btnPrepare.onclick = onPrepare;
btnCancel.onclick  = closeModal;
btnConfirm.onclick = onConfirm;

function updateHint(){
  const v = parseFloat(elAmt.value || '0');
  if (!v) { elConv.textContent=''; return; }
  elConv.textContent = (elCur.value==='ETH')
    ? `You will send ${v} ETH.`
    : `You want to send $${toFixed(v,2)} worth of ETH (rate fetched on review).`;
}

async function onPrepare(){
  try{
    elErr.textContent = '';
    const to = (elTo.value||'').trim();
    const v  = parseFloat(elAmt.value||'0');
    const cur= elCur.value;

    if (!isAddress(to)) throw new Error('Invalid recipient address');
    if (!(v>0)) throw new Error('Amount must be > 0');

    const res = await postJSON(`${API_BASE_URL}/transfer/prepare`, {
      sender: wallet.address,
      recipient: to,
      amount: v,
      currency: cur
    });
    // res: { message, nonce, expiresAt, ethAmount }
    approve = res;

    // Parse the message into fields:
    // "Transfer X ETH (optional $Y USD) to TO from FROM | nonce=... | exp=UNIX"
    const m = res.message;
    const rx = /^Transfer ([\d.]+) ETH(?: \(\$([\d.]+) USD\))? to (0x[a-fA-F0-9]{40}) from (0x[a-fA-F0-9]{40}) \| nonce=([a-z0-9]+) \| exp=(\d+)$/i;
    const parts = m.match(rx);
    if (!parts) throw new Error('Malformed approval message');
    const [, ethStr, usdStr, toAddr, fromAddr, nonce, exp] = parts;

    apprAmount.textContent = `${Number(ethStr).toFixed(6)} ETH`;
    apprUsd.textContent = usdStr ? `( $${Number(usdStr).toFixed(2)} USD )` : '';
    apprTo.textContent = toAddr;
    apprFrom.textContent = fromAddr;
    apprNonce.textContent = nonce;
    apprExp.textContent = new Date(Number(exp)*1000).toLocaleTimeString();

    openModalWithTimer(res.expiresAt);
  }catch(e){
    console.error(e);
    elErr.textContent = e.message || 'Failed to prepare transaction';
  }
}

function openModalWithTimer(expiresAt){
  modal.classList.add('open');
  const ttl = Math.max(0, expiresAt - Math.floor(Date.now()/1000));
  const start = Date.now();
  timerBar.style.width = '100%';
  if (timerId) clearInterval(timerId);
  timerId = setInterval(()=>{
    const left = ttl - (Date.now()-start)/1000;
    const pct = Math.max(0, Math.min(1, left/ttl));
    timerBar.style.width = `${pct*100}%`;
    if (left <= 0){
      clearInterval(timerId); timerId=null; closeModal();
      elErr.textContent = 'Approval expired. Please try again.';
    }
  }, 100);
}

function closeModal(){
  modal.classList.remove('open');
  if (timerId){ clearInterval(timerId); timerId=null; }
}

async function onConfirm(){
  try{
    if (!approve) return;
    const signer = new window.ethers.Wallet(wallet.privateKey);
    const signature = await signer.signMessage(approve.message);

    const res = await postJSON(`${API_BASE_URL}/transfer/confirm`, {
      sender: wallet.address,
      nonce: approve.nonce,
      signature
    });

    // Update local balance if returned
    if (typeof res.senderBalanceEth === 'number'){
      wallet.balance = res.senderBalanceEth; saveWallet(wallet);
    }

    closeModal();
    // Minimal success feedback
    alert('Transaction successful!');
    location.href = 'dashboard.html';
  }catch(e){
    console.error(e);
    closeModal();
    elErr.textContent = e.message || 'Transaction failed';
  }
}
