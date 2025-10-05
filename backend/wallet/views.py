from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from decimal import Decimal
from eth_account import Account
import time, random

# --- Enable HD wallet (mnemonic) features in eth-account ---
Account.enable_unaudited_hdwallet_features()

WEI = 10**18
DERIVATION_PATH = "m/44'/60'/0'/0/0"

def wallets_col():
    return settings.MONGO_DB["wallets"]

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
