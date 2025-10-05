from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.core.cache import cache
from decimal import Decimal, InvalidOperation
from eth_account.messages import encode_defunct
from eth_account import Account
import time, random, requests, json

# --- Enable HD wallet (mnemonic) features in eth-account ---
Account.enable_unaudited_hdwallet_features()

WEI = 10**18
DERIVATION_PATH = "m/44'/60'/0'/0/0"

def wallets_col():
    return settings.MONGO_DB["wallets"]

def tx_col():
    return settings.MONGO_DB["transactions"]

def is_hex_address(s: str) -> bool:
    return isinstance(s, str) and s.startswith("0x") and len(s) == 42

def ensure_wallet(address: str):
    """
    Find or create a wallet with a random 1–10 ETH mock balance.
    """
    addr = address.lower()
    w = wallets_col().find_one({"address": addr})
    if not w:
        seed_eth = Decimal(str(random.uniform(1.0, 10.0)))
        w = {
            "address": addr,
            "balance_wei": int(seed_eth * WEI),
            "created_at": int(time.time()),
        }
        wallets_col().insert_one(w)
    return w

def derive_address_from_mnemonic(mnemonic: str) -> str:
    """
    Derive standard ETH address from a 12-word BIP39 mnemonic phrase.
    """
    if not isinstance(mnemonic, str):
        raise ValueError("Mnemonic must be a string")
    words = [w for w in mnemonic.strip().split() if w]
    if len(words) != 12:
        raise ValueError("Mnemonic must be exactly 12 words")

    acct = Account.from_mnemonic(" ".join(words), account_path=DERIVATION_PATH)
    return acct.address

@csrf_exempt
@api_view(["POST"])
def create_wallet(request):
    """
    Generate a 12-word mnemonic and return details.
    """
    acct, mnemonic = Account.create_with_mnemonic(num_words=12)
    address = acct.address

    before = wallets_col().find_one({"address": address.lower()})
    w = ensure_wallet(address)
    was_created = before is None

    return Response({
        "mnemonic": mnemonic,
        "address": w["address"],
        "balanceEth": float(w["balance_wei"] / WEI),
        "wasCreated": was_created
    })

@csrf_exempt
@api_view(["POST"])
def import_wallet(request):
    mnemonic = (request.data.get("mnemonic") or "").strip()
    try:
        address = derive_address_from_mnemonic(mnemonic)
    except ValueError as e:
        return Response({"error": str(e)}, status=400)

    before = wallets_col().find_one({"address": address.lower()})
    w = ensure_wallet(address)
    was_created = before is None

    return Response({
        "address": w["address"],
        "balanceEth": float(w["balance_wei"] / WEI),
        "wasCreated": was_created
    })

@api_view(["GET"])
def balance(request):
    address = (request.GET.get("address") or "").strip().lower()
    if not is_hex_address(address):
        return Response({"error": "Invalid address"}, status=400)

    w = ensure_wallet(address)
    return Response({
        "address": w["address"],
        "balanceEth": float(w["balance_wei"] / WEI),
    })


SKIP_API_URL = "https://api.skip.build/v2/fungible/msgs_direct"
USDC_MAINNET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"  # USDC (6 dp)
ETHEREUM_CHAIN_ID = "1"

def quote_usd_to_eth(amount_usd: Decimal) -> Decimal:
    try:
        usdc_units = int((amount_usd * Decimal(10**6)).quantize(Decimal("1")))
    except InvalidOperation:
        raise ValueError("Invalid USD amount")

    payload = {
        "source_asset_denom": USDC_MAINNET,
        "source_asset_chain_id": ETHEREUM_CHAIN_ID,
        "dest_asset_denom": "ethereum-native",
        "dest_asset_chain_id": ETHEREUM_CHAIN_ID,
        "amount_in": str(usdc_units),  # USDC base units (6 dp)
        "chain_ids_to_addresses": { "1": "0x742d35Cc6634C0532925a3b8D4C9db96c728b0B4" },
        "slippage_tolerance_percent": "1",
        "smart_swap_options": { "evm_swaps": True },
        "allow_unsafe": False
    }

    try:
        r = requests.post(SKIP_API_URL, json=payload, timeout=10)
        r.raise_for_status()
        data = r.json()

        if isinstance(data, dict):
            candidates = [
                ("amount_out", 18),            
                ("dest_amount", 18),           
                ("amount_out_eth", None),      
                ("dest_amount_eth", None),     
                ("eth_out", None),             
            ]
            for key, wei_hint in candidates:
                if key in data:
                    raw = Decimal(str(data[key]))
                    if wei_hint == 18:
                        return raw / Decimal(WEI)  # wei -> ETH
                    return raw                     # already ETH

            for k in ("quote", "result", "swap", "tx", "outputs"):
                if k in data and isinstance(data[k], dict):
                    sub = data[k]
                    for key, wei_hint in candidates:
                        if key in sub:
                            raw = Decimal(str(sub[key]))
                            return raw / Decimal(WEI) if wei_hint == 18 else raw

        raise ValueError("Unknown Skip API response shape")
    except Exception:
        return amount_usd / Decimal("3000")

def build_approval_message(sender: str, recipient: str, eth_amount: Decimal, usd_amount: Decimal | None,
                           nonce: str, expires: int) -> str:
    if usd_amount is not None:
        base = f"Transfer {eth_amount:.6f} ETH (${usd_amount:.2f} USD) to {recipient} from {sender}"
    else:
        base = f"Transfer {eth_amount:.6f} ETH to {recipient} from {sender}"
    return f"{base} | nonce={nonce} | exp={expires}"

@csrf_exempt
@api_view(["POST"])
def prepare_transfer(request):
    sender = (request.data.get("sender") or "").strip().lower()
    recipient = (request.data.get("recipient") or "").strip().lower()
    currency = (request.data.get("currency") or "ETH").upper()

    if not is_hex_address(sender) or not is_hex_address(recipient):
        return Response({"error":"Invalid address"}, status=400)

    try:
        amount = Decimal(str(request.data.get("amount")))
    except Exception:
        return Response({"error":"Invalid amount"}, status=400)

    ensure_wallet(sender)
    ensure_wallet(recipient)

    if currency == "USD":
        eth_amount = quote_usd_to_eth(amount)
        usd_amount = amount
    else:
        eth_amount = amount
        usd_amount = None

    nonce = Account.create().key.hex()[2:10] + str(int(time.time()))
    expires = int(time.time()) + 30  # 30s TTL
    message = build_approval_message(sender, recipient, eth_amount, usd_amount, nonce, expires)

    cache.set(f"tx:{nonce}", json.dumps({
        "sender": sender,
        "recipient": recipient,
        "eth_amount": str(eth_amount),
        "usd_amount": str(usd_amount) if usd_amount is not None else None,
        "expires": expires,
        "display": message,  
    }), timeout=30)

    return Response({
        "message": message,
        "nonce": nonce,
        "expiresAt": expires,
        "ethAmount": float(eth_amount)
    })

@csrf_exempt
@api_view(["POST"])
def confirm_transfer(request):
    nonce = request.data.get("nonce", "")
    signature = (request.data.get("signature") or "").strip()
    sender = (request.data.get("sender") or "").strip().lower()

    if not is_hex_address(sender) or not nonce or not signature:
        return Response({"error":"Invalid payload"}, status=400)

    raw = cache.get(f"tx:{nonce}")
    if not raw:
        return Response({"error":"Expired or invalid nonce"}, status=400)
    info = json.loads(raw)
    if int(time.time()) > info["expires"]:
        return Response({"error":"Approval expired"}, status=400)

    msg = info["display"]
    encoded = encode_defunct(text=msg)
    recovered = Account.recover_message(encoded, signature=signature)
    if recovered.lower() != sender:
        return Response({"error":"Invalid signature"}, status=400)

    eth_amount = Decimal(info["eth_amount"])
    usd_amount = Decimal(info["usd_amount"]) if info.get("usd_amount") else None

    if usd_amount is not None:
        new_eth = quote_usd_to_eth(usd_amount)
        drift = abs((new_eth - eth_amount) / eth_amount) if eth_amount > 0 else Decimal("0")
        if drift > Decimal("0.01"):
            return Response({"error":"Price moved >1%, please retry"}, status=409)
        eth_amount = new_eth

    amt_wei = int(eth_amount * WEI)

    ws = ensure_wallet(sender)
    wr = ensure_wallet(info["recipient"])

    if ws["balance_wei"] < amt_wei:
        cache.delete(f"tx:{nonce}")
        return Response({"error":"Insufficient funds"}, status=400)

    wallets_col().update_one({"address": sender}, {"$inc": {"balance_wei": -amt_wei}})
    wallets_col().update_one({"address": wr["address"]}, {"$inc": {"balance_wei": +amt_wei}})

    tx_doc = {
        "sender": sender,
        "recipient": wr["address"],
        "amount_wei": amt_wei,
        "usd_amount": float(usd_amount) if usd_amount is not None else None,
        "nonce": nonce,
        "status": "success",
        "timestamp": int(time.time()),
        "signed_message": msg,
    }
    ins = tx_col().insert_one(tx_doc)
    cache.delete(f"tx:{nonce}")

    # Fresh balances
    new_sender = wallets_col().find_one({"address": sender})
    new_recipient = wallets_col().find_one({"address": wr["address"]})

    return Response({
        "ok": True,
        "senderBalanceEth": float(new_sender["balance_wei"]/WEI),
        "recipientBalanceEth": float(new_recipient["balance_wei"]/WEI),
        # NEW: tx details for email popup
        "tx": {
            "id": str(ins.inserted_id),
            "sender": tx_doc["sender"],
            "recipient": tx_doc["recipient"],
            "amountWei": tx_doc["amount_wei"],
            "amountEth": float(Decimal(tx_doc["amount_wei"]) / Decimal(WEI)),
            "usdAmount": tx_doc["usd_amount"],
            "timestamp": tx_doc["timestamp"],
            "nonce": tx_doc["nonce"],
        }
    })



@api_view(["GET"])
def tx_history(request):
    """
    Returns list of txs sorted by timestamp desc.
    """
    scope = (request.GET.get("scope") or "").lower()
    address = (request.GET.get("address") or "").strip().lower()

    if scope == "all" or not is_hex_address(address):
        cursor = tx_col().find({}).sort("timestamp", -1).limit(500)
    else:
        cursor = tx_col().find({"$or": [{"sender": address}, {"recipient": address}]}).sort("timestamp", -1).limit(500)

    rows = list(cursor)
    for r in rows:
        r["_id"] = str(r["_id"])
    return Response(rows)


from django.core.mail import send_mail, EmailMessage
import re

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

@csrf_exempt
@api_view(["POST"])
def notify_email(request):
    email = (request.data.get("email") or "").strip()
    tx = request.data.get("tx") or {}

    if not EMAIL_REGEX.match(email):
        return Response({"error":"Invalid email"}, status=400)

    try:
        amt_eth = tx.get("amountEth") or (Decimal(str(tx.get("amountWei", 0))) / Decimal(WEI))
    except Exception:
        amt_eth = 0

    subject = "Your Mock ETH Transfer Receipt"
    lines = [
        "Thanks for using CypherD Wallet (Mock).",
        "",
        f"Status    : SUCCESS",
        f"Amount    : {float(amt_eth):.6f} ETH" + (f" (${tx['usdAmount']:.2f} USD)" if tx.get("usdAmount") is not None else ""),
        f"From      : {tx.get('sender','')}",
        f"To        : {tx.get('recipient','')}",
        f"Timestamp : {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(int(tx.get('timestamp', 0))))}",
        f"Nonce     : {tx.get('nonce','')}",
        f"Tx ID     : {tx.get('id','')}",
        "",
        "This is a Mock Transaction Receipt.",
    ]
    body = "\n".join(lines)

    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None) or getattr(settings, "EMAIL_HOST_USER", None) or "no-reply@example.com",
            recipient_list=[email],
            fail_silently=False,
        )
        return Response({"ok": True})
    except Exception as e:
        return Response({"error": f"Email send failed: {e}"}, status=500)
