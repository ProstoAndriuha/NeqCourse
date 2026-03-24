# Backend Architecture for Online Courses Platform

## Overview

Схема вынесена в SQL-first миграции и дополнена backend-скелетом на Fastify + PostgreSQL + Drizzle runtime.

Текущее состояние проекта:

- канонический источник структуры БД: `backend/migrations/*.sql`;
- собранный snapshot схемы: `backend/schema.sql`;
- тестовые данные: `backend/seed.sql`;
- SQL-проверки бизнес-сценариев: `backend/checks/business_scenarios.sql`;
- API-контракты: `backend/api-contracts.md`;
- Node.js backend scaffold: `src/`;
- scripts для миграций и проверки сценариев: `backend/scripts/*.ts`;
- отдельные route-level integration tests: `tests/integration/routes.test.ts`;
- локальный реальный smoke-run на PostgreSQL: `npm run db:local:smoke`.

## Migration Layout

Миграции разложены так:

1. `001_extensions_and_enums.sql`
2. `002_users_and_roles.sql`
3. `003_catalog.sql`
4. `004_orders_and_payments.sql`
5. `005_enrollments_and_progress.sql`
6. `006_reviews_notifications_certificates.sql`
7. `007_auth_and_idempotency.sql`

## Core Design Choices

### Roles

- `users` хранит все аккаунты;
- `teachers` является публичным расширением профиля преподавателя;
- `user_role_assignments` дает multi-role модель для `admin`, `moderator`, `manager`, `teacher`, `student`;
- request context хранит `userId`, `role`, `roles`, `tokenVersion`.

Текущая role policy в runtime:

- learner routes: `student`, `teacher`, `admin`, `manager`;
- review creation: `student`, `teacher`;
- moderation/admin flows зарезервированы под `admin`, `moderator`, `manager`;
- будущие CRUD маршруты курсов стоит делить так: authoring для `teacher`, platform overrides для `admin` и `manager`.

### Auth Lifecycle

Реализован production-like lifecycle токенов:

- короткоживущий access token;
- long-lived refresh token;
- DB-backed refresh storage в `refresh_tokens`;
- refresh rotation на каждом успешном refresh;
- `logout` для revoke конкретного refresh token;
- `logout-all` через `users.token_version` и массовый revoke refresh token'ов.

### Soft Delete and Uniqueness

Чтобы soft delete не конфликтовал с повторным созданием сущностей, уникальность для некоторых полей сделана через partial unique indexes на активные записи:

- `courses.slug WHERE deleted_at IS NULL`
- `promocodes.code WHERE deleted_at IS NULL`
- `course_modules(course_id, sort_order) WHERE deleted_at IS NULL`
- `lessons(module_id, sort_order) WHERE deleted_at IS NULL`
- `lessons(module_id, slug) WHERE deleted_at IS NULL`

### Order Price Snapshots

`order_items` хранит snapshot-данные на момент покупки:

- `title_snapshot`
- `item_snapshot`
- `unit_price_amount`
- `discount_amount`
- `final_price_amount`
- `currency`

### Progress Model

`progress` хранит одну строку на `user + lesson` и включает:

- `status`
- `is_completed`
- `progress_percent`
- `watch_percent`
- `last_position_seconds`
- `completed_at`

### Idempotency and Rate Limits

Реализованы базовые production guards:

- `idempotency_keys` для `checkout:create-order` и `payments:webhook`;
- checkout требует `Idempotency-Key`;
- webhook использует header `Idempotency-Key` или fallback `<provider>:<providerPaymentId>`;
- in-memory rate limit для `register`, `login`, `refresh`, `payments webhook`, `review create`.

Текущее ограничение: rate limit in-memory и годится для single-instance запуска; для горизонтального scale его нужно переносить в Redis.

## Runtime Commands

После настройки `.env` доступны команды:

```bash
npm run dev
npm run build
npm run db:migrate
npm run db:check
npm run db:rebuild-schema
npm run db:local:smoke
npm run test:integration
```

Файл `.env.example` уже добавлен.

## What Was Verified in the Schema

В схеме зафиксированы и проверены на уровне DDL:

- `CHECK` для процентов, рейтингов и сумм;
- `UNIQUE(user_id, course_id)` для `reviews` и `certificates`;
- `UNIQUE(provider, provider_payment_id)` для `payments`;
- partial unique index для активных подписок по одному плану;
- согласованные `ON DELETE` правила для коммерческого и учебного контуров;
- soft delete совместим с повторным использованием `slug` и `code` у удаленных сущностей.

## Business Scenario Checks

Подготовлены три формата проверки:

- SQL-файл: `backend/checks/business_scenarios.sql`
- Node script против настроенной БД: `npm run db:check`
- полный локальный PostgreSQL + API smoke-run: `npm run db:local:smoke`
- отдельный route-level integration suite: `npm run test:integration`

Они покрывают:

- покупку курса;
- выдачу enrollment;
- доступ по подписке;
- завершение урока и обновление progress;
- проверку сертификата;
- применение промокода;
- регистрацию пользователя через API;
- login, refresh, logout, logout-all;
- checkout idempotency;
- payments webhook idempotency;
- enrollment access, progress update и review create через реальные HTTP routes.

## API Contracts

Контракты вынесены в `backend/api-contracts.md`.

Зафиксированы endpoint'ы:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/catalog/courses`
- `GET /api/catalog/courses/:slug`
- `POST /api/checkout/orders`
- `POST /api/payments/webhook`
- `GET /api/enrollments/:courseId/access`
- `PUT /api/progress/lessons/:lessonId`
- `POST /api/reviews`

## Local PostgreSQL Status

На этой машине нет системно установленного PostgreSQL в `PATH` и нет Docker, но реальный локальный PostgreSQL поднимается внутри проекта через `embedded-postgres`.

Фактически выполненные прогоны:

1. поднят локальный PostgreSQL на `127.0.0.1:55432` для smoke-run;
2. поднят локальный PostgreSQL на `127.0.0.1:55433` для route-level integration tests;
3. выполнены все миграции;
4. выполнен `seed.sql`;
5. прогнаны SQL-сценарии;
6. прогнаны HTTP end-to-end сценарии через Fastify `inject()`.

## Recommended Stack

Для старта выбран вектор, который вы предложили:

- Fastify
- PostgreSQL
- Drizzle runtime
- SQL-first migrations

Это дает простой старт без потери контроля над production SQL.

## Files

- Schema snapshot: [backend/schema.sql](/d:/University/ANU2.5/TWEB/backend/schema.sql)
- Seed data: [backend/seed.sql](/d:/University/ANU2.5/TWEB/backend/seed.sql)
- Migrations: [backend/migrations/001_extensions_and_enums.sql](/d:/University/ANU2.5/TWEB/backend/migrations/001_extensions_and_enums.sql)
- Business checks: [backend/checks/business_scenarios.sql](/d:/University/ANU2.5/TWEB/backend/checks/business_scenarios.sql)
- API contracts: [backend/api-contracts.md](/d:/University/ANU2.5/TWEB/backend/api-contracts.md)
- Route tests: [tests/integration/routes.test.ts](/d:/University/ANU2.5/TWEB/tests/integration/routes.test.ts)
