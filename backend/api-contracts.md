# API Contracts

## Auth

### `POST /api/auth/register`

Request body:

```json
{
  "email": "student@example.com",
  "password": "StrongPassword123!",
  "firstName": "Andrei",
  "lastName": "Ionescu"
}
```

Response `201`:

```json
{
  "user": {
    "id": "uuid",
    "email": "student@example.com",
    "role": "student"
  }
}
```

### `POST /api/auth/login`

Request body:

```json
{
  "email": "student@example.com",
  "password": "StrongPassword123!"
}
```

Response `200`:

```json
{
  "accessToken": "signed-access-token",
  "refreshToken": "signed-refresh-token",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresIn": 2592000,
  "user": {
    "id": "uuid",
    "email": "student@example.com",
    "role": "student"
  }
}
```

### `POST /api/auth/refresh`

Request body:

```json
{
  "refreshToken": "signed-refresh-token"
}
```

Response `200`:

```json
{
  "accessToken": "new-signed-access-token",
  "refreshToken": "new-signed-refresh-token",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresIn": 2592000,
  "user": {
    "id": "uuid",
    "email": "student@example.com",
    "role": "student"
  }
}
```

Notes:

- refresh token rotates on every successful refresh;
- old refresh token becomes invalid immediately;
- `logout-all` invalidates existing access tokens through `users.token_version`.

### `POST /api/auth/logout`

Headers:

```json
{
  "authorization": "Bearer <accessToken>"
}
```

Request body:

```json
{
  "refreshToken": "signed-refresh-token"
}
```

Response `200`:

```json
{
  "loggedOut": true
}
```

### `POST /api/auth/logout-all`

Headers:

```json
{
  "authorization": "Bearer <accessToken>"
}
```

Response `200`:

```json
{
  "loggedOutAll": true,
  "tokenVersion": 2
}
```

## Catalog

### `GET /api/catalog/courses`

Query params:

```json
{
  "category": "backend",
  "level": "intermediate",
  "search": "postgres",
  "page": 1,
  "limit": 12
}
```

Response `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "slug": "postgresql-for-backend-developers",
      "title": "PostgreSQL for Backend Developers",
      "priceAmount": 149,
      "currency": "USD",
      "teacher": {
        "id": "uuid",
        "displayName": "Elena Popescu"
      }
    }
  ],
  "page": 1,
  "limit": 12,
  "total": 1
}
```

### `GET /api/catalog/courses/:slug`

Response `200`:

```json
{
  "id": "uuid",
  "slug": "postgresql-for-backend-developers",
  "modules": [
    {
      "id": "uuid",
      "title": "Module 1",
      "lessons": [
        {
          "id": "uuid",
          "title": "Lesson 1",
          "isPreview": true
        }
      ]
    }
  ]
}
```

## Checkout

### `POST /api/checkout/orders`

Headers:

```json
{
  "authorization": "Bearer <accessToken>",
  "idempotency-key": "checkout-order-uuid"
}
```

Request body:

```json
{
  "items": [
    {
      "type": "course",
      "courseId": "uuid"
    }
  ],
  "promocode": "SPRING20"
}
```

Response `201`:

```json
{
  "orderId": "uuid",
  "orderNumber": "ORD-20260316-0001",
  "status": "awaiting_payment",
  "totalAmount": 119.2,
  "currency": "USD"
}
```

Notes:

- `idempotency-key` is required;
- repeating the same request with the same key returns the same order and sets `Idempotency-Replayed: true`.

## Payments

### `POST /api/payments/webhook`

Headers:

```json
{
  "idempotency-key": "optional-provider-event-id"
}
```

Request body:

```json
{
  "orderNumber": "ORD-20260316-0001",
  "provider": "stripe",
  "providerPaymentId": "pi_123",
  "providerCustomerId": "cus_123",
  "status": "succeeded",
  "amount": 119.2,
  "currency": "USD",
  "paymentMethodLast4": "4242"
}
```

Response `200`:

```json
{
  "received": true
}
```

Notes:

- if `idempotency-key` is omitted, backend falls back to `<provider>:<providerPaymentId>`;
- repeated delivery with the same logical payment replays the stored response and does not create duplicate payments, subscriptions, or enrollments.

## Enrollment Access

### `GET /api/enrollments/:courseId/access`

Headers:

```json
{
  "authorization": "Bearer <accessToken>"
}
```

Response `200`:

```json
{
  "hasAccess": true,
  "accessType": "purchase",
  "expiresAt": null
}
```

## Progress

### `PUT /api/progress/lessons/:lessonId`

Headers:

```json
{
  "authorization": "Bearer <accessToken>"
}
```

Request body:

```json
{
  "status": "in_progress",
  "progressPercent": 45,
  "watchPercent": 45,
  "lastPositionSeconds": 810,
  "isCompleted": false
}
```

Response `200`:

```json
{
  "lessonId": "uuid",
  "status": "in_progress",
  "progressPercent": 45,
  "watchPercent": 45
}
```

## Reviews

### `POST /api/reviews`

Headers:

```json
{
  "authorization": "Bearer <accessToken>"
}
```

Request body:

```json
{
  "courseId": "uuid",
  "rating": 5,
  "title": "Strong course",
  "body": "Production-level examples."
}
```

Response `201`:

```json
{
  "id": "uuid",
  "courseId": "uuid",
  "rating": 5,
  "status": "pending_moderation"
}
```

## Security Notes

- protected routes resolve `request.auth.userId`, `request.auth.role`, and `request.auth.roles` from bearer access token plus live user state in PostgreSQL;
- current role policy is: learner routes allow `student`, `teacher`, `admin`, `manager`; review creation allows `student`, `teacher`; moderation/admin flows are reserved for `admin`, `moderator`, `manager`.
