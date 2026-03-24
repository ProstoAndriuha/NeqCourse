# NeqCourse

Platformă de învățare online cu backend **Fastify + PostgreSQL** și frontend multi-page.

## Structura proiectului

```
├── index.html                  # Landing page
├── pages/
│   ├── courses.html            # Catalog cursuri
│   ├── course.html             # Detalii curs (dynamic, ?slug=...)
│   ├── course1-4.html          # Pagini statice cursuri
│   ├── login.html / register.html
│   ├── dashboard.html          # Dashboard student
│   └── admin.html              # Panou administrare (CRUD)
├── css/main.css                # Stiluri — responsive, dark mode
├── js/                         # Frontend vanilla JS
│   ├── auth.js                 # Modul NeqAuth (API, sesiuni JWT)
│   ├── admin.js                # Admin panel logic (utilizatori, cursuri)
│   ├── main.js                 # Navigație, meniu mobil
│   ├── animations.js           # GSAP animații
│   └── ...                     # login, register, courses, dashboard, etc.
├── src/                        # Backend TypeScript (Fastify v5)
│   ├── server.ts / app.ts      # Entry point + plugin-uri
│   ├── routes/                 # API endpoints
│   │   ├── auth.ts             # Register, login, refresh, logout
│   │   ├── admin.ts            # Overview, CRUD utilizatori/cursuri
│   │   ├── catalog.ts          # Listare și detalii cursuri
│   │   ├── checkout.ts         # Checkout + demo payments
│   │   ├── enrollments.ts      # Înscrieri
│   │   ├── progress.ts         # Progres lecții
│   │   └── ...
│   ├── auth/                   # Password hashing (scrypt), JWT, roluri
│   ├── db/pool.ts              # Conexiune PostgreSQL
│   └── lib/                    # Business logic (payments, idempotency, etc.)
├── backend/
│   ├── migrations/             # 7 fișiere SQL de migrare
│   ├── seed.sql                # Seed: admin user
│   └── scripts/                # Dev scripts (migrate, seed, rebuild)
└── tests/integration/          # Teste de integrare
```

## Stack tehnologic

| Nivel | Tehnologii |
|-------|-----------|
| **Frontend** | HTML · CSS · Vanilla JS · GSAP · Font Awesome 6.5 · Google Fonts |
| **Backend** | Node.js · Fastify v5 · TypeScript · tsx |
| **Baza de date** | PostgreSQL (embedded-postgres pentru dev) |
| **Autentificare** | JWT (access + refresh tokens) · scrypt password hashing |
| **Plăți** | HMAC SHA-256 webhook signatures · demo payment flow |

## Instalare și rulare

```bash
# 1. Instalare dependențe
npm install

# 2. Creează fișierul .env (copiază din exemplu)
cp .env.example .env

# 3. Pornește PostgreSQL embedded + migrări + seed + server
npm run dev
```

Serverul pornește pe **http://localhost:3000**.

### Scripturi disponibile

| Comanda | Descriere |
|---------|-----------|
| `npm run dev` | Pornește tot (DB + migrări + seed + server cu hot-reload) |
| `npm run db:start` | Pornește doar PostgreSQL embedded |
| `npm run db:migrate` | Rulează migrările SQL |
| `npm run db:seed` | Seed baza de date (admin user) |
| `npm run db:rebuild` | Drop + recreare schema completă |

## Cont Admin

- **Email:** `admin@neqcourse.com`
- **Parolă:** `Admin@2026`

Contul este creat automat la seed. Permite acces la `/pages/admin.html` cu:
- Statistici live (utilizatori, cursuri, înscriși)
- CRUD utilizatori (adaugă, șterge, schimbă rol)
- CRUD cursuri (adaugă, șterge)
- Roluri disponibile: `student`, `teacher`, `admin`, `manager`, `moderator`

## API endpoints principale

| Metoda | Endpoint | Descriere |
|--------|----------|-----------|
| POST | `/api/auth/register` | Înregistrare utilizator |
| POST | `/api/auth/login` | Autentificare (returnează JWT) |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/catalog/courses` | Listare cursuri publicate |
| GET | `/api/admin/overview` | Statistici + liste (admin only) |
| POST | `/api/admin/users` | Creare utilizator (admin) |
| DELETE | `/api/admin/users/:id` | Ștergere utilizator (admin) |
| PATCH | `/api/admin/users/:id/role` | Schimbare rol (admin) |
| POST | `/api/admin/courses` | Creare curs (admin) |
| DELETE | `/api/admin/courses/:id` | Ștergere curs (admin) |
| POST | `/api/checkout/orders` | Creare comandă |
| POST | `/api/payments/webhook` | Webhook plată (HMAC) |

## Securitate

- Parole hash-uite cu **scrypt** (nu plaintext, nu bcrypt demo)
- **JWT** access tokens (15 min) + refresh tokens (7 zile)
- Rate limiting pe rutele de autentificare
- Validare input cu **Zod** pe toate endpoint-urile
- Protecție HMAC SHA-256 pe webhook-uri de plată
- Roluri server-side (`admin`, `manager`) cu verificare pe fiecare rută protejată
- Protecție self-delete (adminul nu se poate șterge pe sine)

## Baza de date

Schema PostgreSQL cu 26+ tabele, inclusiv:
- `users`, `user_role_assignments`, `teachers`
- `courses`, `sections`, `lessons`, `lesson_media`
- `orders`, `payments`, `enrollments`, `lesson_progress`
- `reviews`, `notifications`, `certificates`
- `auth_sessions`, `refresh_tokens`, `idempotency_keys`

Migrările sunt în `backend/migrations/` (001–007), aplicate secvențial.
- [ ] backend real si persistenta server-side
- [ ] integrare productie pentru autentificare si gestionare cursuri

## Observatie Finala

NeqCourse este in acest moment un proiect frontend demonstrativ bine structurat pentru prezentare, testare UX si extindere ulterioara catre o aplicatie full-stack.
