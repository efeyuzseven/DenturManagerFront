# Dentur Manager Dashboard

Bu repo iki parca halinde kuruldu:

- Kok dizin: React + Vite ile yazilmis yonetim dashboard frontend'i
- `backend/`: Farkli Dentur projelerinden veri toplayip normalize eden Express aggregator API

## Mimari

Bu proje uc farkli kaynaktan veri toplamaya gore tasarlandi:

- `Dentur Rezervasyon`
- `Dentur Evrak Takip`
- `Dentur Avrasya`

Kaynak sistemlerin endpoint ve veri modelleri birebir ayni olmadigi icin, backend tarafinda her kaynak icin ayri adapter bulunur. Frontend ise yalnizca `backend` servisinden veri alir.

## Kurulum

### 1. Frontend

```bash
npm install
copy .env.example .env
npm run dev
```

`npm run dev` artik frontend ve `backend` servisini birlikte kaldirir.
Frontend gelistirme modunda `/api` isteklerini otomatik olarak `http://localhost:4301` adresine proxy eder.

### 2. Backend

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Tek basina backend build almak icin:

```bash
npm run build:server
```

## Backend env notlari

`backend/.env` icinde bu alanlari doldurun:

- `RESERVATION_API_BASE`
- `RESERVATION_API_TOKEN`
- `EVRAK_API_BASE`
- `EVRAK_API_TOKEN`
- `AVRASYA_API_BASE`
- `AVRASYA_API_TOKEN`

Notlar:

- Rezervasyon muhasebe endpoint'leri `Authorize` kullaniyor, bu nedenle token tanimlamak gerekir.
- EvrakTakip tarafinda gelir ve gider toplam endpoint'leri kullanildi.
- Avrasya tarafinda odenmis bilet tutari ve yolcu sayisi `TourTicket` verisinden toplanir. Bu kaynak simdilik sadece gelir tarafinda `partial` durumundadir.

## Hazir endpoint

Backend su endpoint'i sunar:

```text
GET /api/dashboard/overview?range=7d|30d|90d
```

## Ilk surum kapsami

- Toplam gelir, gider, net sonuc ve potansiyel bakiye kartlari
- Kaynak bazli proje ozetleri
- Birlesik gunluk akis gorunumu
- Son hareketler listesi
- Entegrasyon durumlarini gosteren yonetici ozeti
- Hazir 7/30/90 gun filtreleri ile birlikte gun, ay ve yil bazli secim
