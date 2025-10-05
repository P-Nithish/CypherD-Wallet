# CypherD Wallet (Mock Web3 Wallet)

A simple full-stack mock wallet that lets users:

- Create or import a **12-word** mnemonic and derive an Ethereum address
- See a **mock ETH** balance 
- Send transfers in **ETH** or **USD** (USD is quoted to ETH via Skip API)
- **Approve & sign**  before the transfer
- View **transaction history**
- Send a **transaction receipt via email** after a transfer which is Optional

## Prerequisites/Backend Setup

- **Python** 3.10+ needed 
- **MongoDB** 6.x+ running locally

### Create & activate a virtual env
```
cd backend
python -m venv venv
.venv\Scripts\activate 
```

### Install dependencies

```
pip install -r requirements.txt
```

### Run the Backend server
```
python manage.py runserver 8000
```

## Frontend Setup

### Run the Frontend server
```
cd frontend
python -m http.server 5173
```

## How to Use (Walkthrough)

### Create wallet

- Click Create New Wallet → note your 12-word phrase
- Click I’ve saved my phrase → your wallet address seeded balance appear
- Click Go to Dashboard

### Import wallet 

- On the setup page, paste a valid 12-word phrase and Import
- You’ll see its address & balance

### Send a transfer (dashboard → Send)

- Enter recipient and amount
- Select ETH or USD (USD converts via Skip API)
- Click Review → an Approve modal appears
- A Send Email Receipt modal appears → enter email and Send, or Skip

### Transactions page

- See all transactions involving your address, newest first
