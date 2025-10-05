from django.urls import path
from . import views

urlpatterns = [
    path("wallet/create", views.create_wallet),   # POST -> generate 12-word mnemonic on server
    path("wallet/import", views.import_wallet),   # POST -> accept 12-word mnemonic, derive address
    path("wallet/balance", views.balance),  
]
