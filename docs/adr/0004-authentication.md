# ADR 0004: Internal credential auth behind an identity port

## Status
Accepted

## Context
The platform needs email/password auth now and enterprise SSO (OIDC) later.

## Decision
- Credentials are managed internally: argon2id password hashing, DB-backed sessions with hashed tokens, httpOnly+Secure+SameSite=Lax cookies, session expiration/rotation and revocation.
- Brute-force protection: per-account failed-attempt lockout plus per-IP rate limiting in Redis.
- The auth service is an adapter behind an identity port so an external IdP (OIDC) can replace it without touching use cases.

## Security implications (documented tradeoff)
Managing credentials internally means we own hashing, lockout, reset, and verification flows and their audit trail. An external IdP would reduce this surface; the port keeps that migration open. Email verification and password reset issue single-use hashed tokens; email delivery is a notification adapter (logged locally in development).
