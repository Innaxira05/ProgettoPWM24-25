# FastFood — Backend (Node.js + Express + MongoDB)

## Avvio
1. `cd backend && npm install`
2. Copia `.env.example` in `.env` e imposta `JWT_SECRET`
3. Metti `meals_1.json` in `backend/data/`
4. Avvia MongoDB in locale, poi `npm run dev`
5. API: http://localhost:3000/api  ·  Swagger: http://localhost:3000/api-docs

Al primo avvio, se il catalogo piatti è vuoto, il JSON viene caricato da solo (`npm run seed` per rifarlo a mano).

## Struttura
- `server.js` entry point · `swagger.js` spec OpenAPI · `config/db.js` connessione Mongo
- `models/` User, Restaurant, Dish (catalogo + menu), Order
- `routes/` auth, users, restaurants, dishes, orders, deliveries
- `middleware/` auth (JWT + ruoli), validateId, errorHandler
- `utils/` geo (OpenStreetMap), allergens, seedCatalog, helpers

## Endpoint principali
| Metodo | Percorso | Chi |
|---|---|---|
| POST | /api/auth/register · /api/auth/login | tutti |
| GET/PUT/DELETE | /api/users/me | loggato |
| GET | /api/restaurants?nome=&luogo=&piatto= · /:id | tutti |
| GET/PUT | /api/restaurants/me · GET /me/stats | ristoratore |
| GET | /api/dishes/catalog · /api/dishes · /api/dishes/:id | tutti |
| POST/PUT/DELETE | /api/dishes(/:id) | ristoratore |
| GET | /api/orders/stima-consegna | cliente |
| POST/GET | /api/orders · GET /:id | cliente / ristoratore |
| PATCH | /api/orders/:id/avanza | ristoratore |
| GET | /api/deliveries · PATCH /:id/ricevuto | cliente (ricevuto) |

## Da completare / decidere
- Adattare `utils/seedCatalog.js` alla struttura reale di `meals_1.json`
- Consegna a domicilio "solo per gruppi di due persone" (vedi traccia)
- Upload foto piatti personalizzati (ora `immagine` è un URL)
- Test delle API e screenshot per la relazione
