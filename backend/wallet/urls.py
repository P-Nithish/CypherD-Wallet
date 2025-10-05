from django.urls import path
from . import views

urlpatterns = [
    path("wallet/create", views.create_wallet),   
    path("wallet/import", views.import_wallet),   
    path("wallet/balance", views.balance),  

    path("transfer/prepare", views.prepare_transfer),   
    path("transfer/confirm", views.confirm_transfer),   

    path("tx/history", views.tx_history), 
]
