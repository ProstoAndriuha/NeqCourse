# TWEB - NeqCourse

NeqCourse este o platformă de invatare online construita ca site static multi-page, cu accent pe prezentare moderna, experienta responsive si fluxuri demo pentru autentificare, inscriere la cursuri, dashboard si administrare.

## Prezentare Generala

Proiectul include:

- pagina principala cu hero, cursuri populare si sectiuni de prezentare
- catalog de cursuri cu filtrare live dupa text, categorie si nivel
- patru pagini individuale de curs
- pagini de autentificare si inregistrare
- dashboard pentru utilizatorul autentificat
- panou admin pentru gestionarea utilizatorilor in varianta demo
- componente comune pentru navigatie mobila, countdown, dialoguri si feedback vizual

## Structura Proiectului

- `index.html` — landing page
- `pages/courses.html` — catalogul complet de cursuri
- `pages/course1.html` — curs Dezvoltare Web Full-Stack
- `pages/course2.html` — curs Data Science si Machine Learning
- `pages/course3.html` — curs Design UI/UX pentru Incepatori
- `pages/course4.html` — curs Marketing Digital Avansat
- `pages/login.html` — autentificare utilizator
- `pages/register.html` — creare cont nou
- `pages/dashboard.html` — dashboard student/admin dupa login
- `pages/admin.html` — panou de administrare
- `css/main.css` — stilizare globala, responsive, dark mode si componente UI
- `js/main.js` — comportament comun pentru site
- `js/auth.js` — autentificare demo si persistenta utilizatori/sesiune
- `js/login.js` — validare si login pentru pagina de autentificare
- `js/register.js` — validare formular si inregistrare utilizator
- `js/courses.js` — filtrare live in catalog
- `js/course.js` — logica pentru paginile individuale de curs
- `js/dashboard.js` — populare dashboard pentru utilizatorul conectat
- `js/admin.js` — statistici si gestionare utilizatori in pagina admin

## Functionalitati Implementate

### Interfata

- layout modern si responsive pentru desktop, tableta si mobil
- componente vizuale dedicate pentru landing page, auth, register, catalog si pagini de curs
- dark mode bazat pe `prefers-color-scheme`
- meniu mobil cu toggle
- carduri, alerte, badge-uri, breadcrumb, tabele responsive si componente reutilizabile

### Fluxuri JavaScript

- autentificare demo cu sesiune in `sessionStorage`
- persistenta utilizatorilor in `localStorage`
- seed automat pentru un cont admin demo
- auto-login dupa inregistrare
- afisare conditionata a linkurilor din navigatie in functie de sesiune
- inscriere la cursuri pentru utilizatori conectati
- dashboard cu lista cursurilor la care utilizatorul este inscris
- panou admin cu statistici si stergere utilizatori student
- countdown persistent pe paginile de curs
- filtrare live in catalogul de cursuri

## Tehnologii

- HTML5
- CSS3
- JavaScript vanilla
- Font Awesome 6.5
- Google Fonts
- `localStorage` si `sessionStorage` pentru demo data persistence

## Rulare Locala

Fiind un proiect static, poate fi rulat foarte simplu:

1. Cloneaza repository-ul.
2. Deschide folderul proiectului in VS Code.
3. Ruleaza cu un server static local, de exemplu Live Server, sau deschide `index.html` direct in browser.

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
