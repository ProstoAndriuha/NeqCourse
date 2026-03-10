# NeqCourse

Platformă de învățare online — site static multi-page.

## Ce e în proiect

| Pagină | Fișier |
|---|---|
| Landing | `index.html` |
| Catalog cursuri | `pages/courses.html` |
| Curs 1–4 | `pages/course1-4.html` |
| Login / Register | `pages/login.html`, `pages/register.html` |
| Dashboard | `pages/dashboard.html` |
| Admin | `pages/admin.html` |

**Stilizare:** `css/main.css` — responsive, dark mode, GSAP-ready  
**JS:** `js/auth.js`, `main.js`, `login.js`, `register.js`, `courses.js`, `course.js`, `dashboard.js`, `admin.js`, `animations.js`

Date demo stocate în `localStorage` / `sessionStorage`. Cont admin setat automat la primul rulaj.

## Rulare

```bash
npm install
# apoi deschide index.html cu Live Server / Five Server
```

## Stack

HTML · CSS · Vanilla JS · GSAP · Font Awesome 6.5 · Google Fonts

Pentru o experienta mai stabila este recomandat un server local, mai ales daca vrei sa navighezi intre pagini in mod similar cu deployment-ul real.

## Cont Demo Admin

Aplicatia creeaza automat un cont admin demo la prima rulare:

- email: `admin@neqcourse.com`
- parola: `Admin@2026`

Acest cont este folosit pentru testarea paginii `pages/admin.html` si a fluxurilor de administrare.

## Observatii De Securitate

Autentificarea din acest proiect este strict demonstrativa.

- utilizatorii sunt stocati in `localStorage`
- sesiunea este stocata in `sessionStorage`
- parola este doar obfuscata pe client, nu hash-uita securizat pentru productie
- nu exista backend, baza de date, control real de acces sau protectie server-side

Prin urmare, implementarea actuala nu trebuie folosita in productie. Pentru un sistem real este necesar un backend cu autentificare sigura, hashing cu bcrypt/argon2, validare server-side si management corect al sesiunilor.

## Stadiu Curent

- [x] structura HTML pentru toate paginile principale
- [x] stilizare completa pentru landing, auth, register, catalog, dashboard si admin
- [x] module JavaScript pentru fluxurile demo esentiale
- [x] navigatie conditionata in functie de sesiune
- [x] dashboard si administrare in varianta frontend-only demo
- [ ] backend real si persistenta server-side
- [ ] integrare productie pentru autentificare si gestionare cursuri

## Observatie Finala

NeqCourse este in acest moment un proiect frontend demonstrativ bine structurat pentru prezentare, testare UX si extindere ulterioara catre o aplicatie full-stack.
