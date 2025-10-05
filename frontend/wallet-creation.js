// uses helpers from shared.js

const btnCreate = document.getElementById('btnCreate');
const btnShowImport = document.getElementById('btnShowImport');
const btnConfirmCreated = document.getElementById('btnConfirmCreated');
const btnImport = document.getElementById('btnImport');
const btnGoDash = document.getElementById('btnGoDash');

const createBox = document.getElementById('createBox');
const mnemonicBox = document.getElementById('mnemonicBox');
const createErr = document.getElementById('createErr');

const importBox = document.getElementById('importBox');
const mnemonicInput = document.getElementById('mnemonicInput');
const importErr = document.getElementById('importErr');

const resultBox = document.getElementById('resultBox');
const addrOut = document.getElementById('addrOut');
const balOut = document.getElementById('balOut');

let lastMnemonic = null;
let lastAddress = null;

btnCreate.onclick = onCreate;
btnShowImport.onclick = showImport;
btnConfirmCreated.onclick = onConfirmCreated;
btnImport.onclick = onImport;
btnGoDash.onclick = () => location.href = 'dashboard.html';

// if already onboarded, jump to dashboard
const existing = loadWallet();
if (existing?.address) location.href = 'dashboard.html';

async function onCreate(){
  try{
    resetViews();
    const res = await postJSON(`${API_BASE_URL}/wallet/create`);
    lastMnemonic = res.mnemonic;
    lastAddress = (res.address||'').toLowerCase();

    mnemonicBox.innerHTML = res.mnemonic.split(' ').map((w,i)=>`<div>${i+1}. ${w}</div>`).join('');
    createBox.style.display = 'block';
  }catch(e){ createErr.textContent = e.message; }
}

function showImport(){
  resetViews();
  importBox.style.display = 'block';
}

async function onConfirmCreated(){
  try{
    if(!lastMnemonic) throw new Error('No mnemonic to confirm.');
    // ethers v6: already on m/44'/60'/0'/0/0
    const wallet = window.ethers.Wallet.fromPhrase(lastMnemonic);
    if (wallet.address.toLowerCase() !== lastAddress) {
      throw new Error('Address mismatch between client & server');
    }
    const balRes = await getJSON(`${API_BASE_URL}/wallet/balance?address=${wallet.address}`);
    const balanceEth = balRes.balanceEth ?? 0;

    saveWallet({ address: wallet.address, privateKey: wallet.privateKey, balance: balanceEth });

    addrOut.textContent = wallet.address;
    balOut.textContent = `${toFixed(balanceEth,4)} ETH`;
    createBox.style.display='none'; resultBox.style.display='block';
  }catch(e){ createErr.textContent = e.message; }
}

async function onImport(){
  try{
    const phrase = (mnemonicInput.value||'').trim().replace(/\s+/g,' ');
    if (phrase.split(' ').length !== 12) throw new Error('Recovery phrase must be exactly 12 words');

    const wallet = window.ethers.Wallet.fromPhrase(phrase);

    const res = await postJSON(`${API_BASE_URL}/wallet/import`, { mnemonic: phrase });
    if ((res.address||'').toLowerCase() !== wallet.address.toLowerCase())
      throw new Error('Address mismatch after import');

    const balRes = await getJSON(`${API_BASE_URL}/wallet/balance?address=${wallet.address}`);
    const balanceEth = balRes.balanceEth ?? 0;

    saveWallet({ address: wallet.address, privateKey: wallet.privateKey, balance: balanceEth });

    addrOut.textContent = wallet.address;
    balOut.textContent = `${toFixed(balanceEth,4)} ETH`;
    importBox.style.display='none'; resultBox.style.display='block';
  }catch(e){ importErr.textContent = e.message; }
}

function resetViews(){
  createBox.style.display='none';
  importBox.style.display='none';
  resultBox.style.display='none';
  createErr.textContent=''; importErr.textContent='';
}
