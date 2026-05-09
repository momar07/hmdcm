# HMDCM CRM - Project Review

---

## 1. Project Overview

This is a **production-grade call center CRM** integrated with Asterisk/Issabel PBX and VICIdial. It features real-time call handling, lead management, and agent activity tracking.

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Django 4.2, DRF, Celery, Django Channels, SimpleJWT |
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, Zustand, React Query, JsSIP |
| **Database** | PostgreSQL |
| **Cache/Broker** | Redis |
| **Telephony** | Asterisk/Issabel PBX, VICIdial |
| **Real-time** | WebSockets (Django Channels) |
| **Async** | Celery + Celery Beat |

### Architecture

The project follows a **modular Django app structure** with 20+ apps:
- `accounts`, `approvals`, `asterisk`, `auditlog`, `calls`, `campaigns`, `common`, `customers`, `dashboard`, `followups`, `integrations`, `leads`, `notes`, `reports`, `sales`, `settings_core`, `tasks`, `teams`, `tickets`, `users`

Frontend is organized with Next.js routing groups:
- `(auth)` - Login page
- `(dashboard)` - Main app with 30+ pages

---

## 2. Strengths

1. **Well-documented** - Extensive changelogs (`CHANGE_LOG.md`), error tracking (`ERROR_FIX.md`), and lifecycle documentation (`docs/`)
2. **Good separation of concerns** - Backend apps follow Django best practices with models, views, serializers, selectors, and services
3. **Real-time capabilities** - WebSocket integration for call events, SIP softphone, and live agent status
4. **Comprehensive call tracking** - `CallAgentEvent` model tracks agent interactions (offered, answered, rejected, timeout)
5. **Security** - `.env` properly gitignored, JWT auth, role-based permissions
6. **Query optimization** - Extensive use of `select_related`/`prefetch_related` (107 matches) to prevent N+1 queries
7. **API documentation** - OpenAPI via `drf-spectacular` (disabled in production)

---

## 3. Issues & Concerns

### Critical

| Issue | Location |
|-------|----------|
| **No tests** | Only one empty `tests.py` file. No test runner configured. |
| **DEBUG=True** | `.env:1` - leaks sensitive data in errors in production |
| **Hardcoded secrets** | `.env` contains DB password, AMI secret, VICIdial credentials |

### High

| Issue | Location |
|-------|----------|
| **No rate limiting** | No throttling on login or API endpoints |
| **Many backup files** | Multiple `.bak_*` files in `calls/` app suggest manual changes outside version control |

### Medium

| Issue | Location |
|-------|----------|
| **No input validation** | Serializers lack explicit field validation |
| **8-hour access token** | Could be shorter for sensitive CRM |
| **No login attempt tracking** | No account lockout after failed attempts |

### Low

| Issue | Location |
|-------|----------|
| **No 2FA** | Two-factor authentication not implemented |
| **JWT in query param** | WebSocket token in `?token=` can leak in server logs |
| **Large ERROR_FIX.md** | 416 lines of bug fixes suggests reactive development |

---

## 4. Security Review

### Authentication & Authorization

| Aspect | Implementation |
|--------|----------------|
| **JWT** | SimpleJWT with `ACCESS_TOKEN_LIFETIME=8h`, `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True` |
| **Permissions** | Custom permission classes: `IsAdmin`, `IsSupervisor`, `IsAdminOrSupervisor` |
| **WebSocket** | JWT auth via query param, authenticated user check before `accept()` |
| **API Auth** | 73 views with proper `permission_classes` configured |

### WebSocket Security (`integrations/consumers.py`)

- ✅ Checks `user.is_authenticated` before accepting connection
- ✅ Separates agents vs supervisors via channel groups
- ✅ Validates JSON in `receive()`
- ⚠️ Token in query param can leak in server logs

### Database

- ✅ Django ORM (safe from SQL injection)
- ✅ Extensive `select_related`/`prefetch_related` usage

### Configuration

| Setting | Value | Risk |
|---------|-------|------|
| `DEBUG` | `True` | High |
| `CORS_ALLOW_CREDENTIALS` | `True` | Medium |
| `ACCESS_TOKEN_LIFETIME` | 8 hours | Medium |
| `CORS_ALLOWED_ORIGINS` | `localhost:3000` (default) | Low |

---

## 5. Recommendations

### Immediate

1. Set `DEBUG=False` in production
2. Move secrets to environment-specific secrets management
3. Add rate limiting to DRF settings

### Short-term

4. Add comprehensive test coverage for critical flows (call handling, lead creation, disposition)
5. Clean up `.bak_*` files or add to proper archival
6. Add serializer field validators
7. Implement login attempt tracking with account lockout

### Long-term

8. Add CI/CD pipeline with automated testing and linting
9. Consider shorter token lifetime (1-2 hours)
10. Implement two-factor authentication
11. Set up proper secrets management (HashiCorp Vault / AWS Secrets Manager)

---

## 6. File Structure Summary

```
hmdcm/
├── crm_backend/           # Django backend
│   ├── apps/              # 20+ Django apps
│   ├── config/            # Settings
│   └── requirements.txt
├── crm_frontend/          # Next.js frontend
│   ├── src/
│   │   ├── app/           # 30+ pages
│   │   ├── components/    # Reusable UI components
│   │   ├── lib/           # API, auth, WebSocket, SIP
│   │   └── store/         # Zustand state management
│   └── package.json
├── docs/                  # Lifecycle documentation
├── CHANGE_LOG.md         # 161 lines of changes
├── ERROR_FIX.md           # 416 lines of bug fixes
└── README.md
```

---

## 7. Performance Under Stress Review

### Database Indexing

| Aspect | Status | Details |
|--------|--------|---------|
| **Indexes** | ✅ Good | 346 index definitions found across models |
| **Common indexes** | ✅ | `db_index=True` on frequently queried fields: `phone`, `email`, `status`, `started_at`, `uniqueid` |
| **Composite indexes** | ✅ | Multi-field indexes for common queries: `(stage, assigned_to)`, `(status, agent)`, `(call, event_type)` |
| **Audit log indexes** | ✅ | User/timestamp, verb/timestamp, lead/timestamp composite indexes |

### Query Optimization

| Aspect | Implementation |
|--------|----------------|
| **select_related** | 107+ usages for foreign key joins |
| **prefetch_related** | Used for reverse FK and M2M (events, tags, items) |
| **.count()** | Used instead of `len(queryset.all())` for counts |
| **Pagination** | DRF configured with `PAGE_SIZE=25` |

### Caching Strategy

| Component | Status |
|-----------|--------|
| **Redis Cache** | ✅ Configured with `django-redis` |
| **Channel Layer** | ✅ Redis-backed WebSocket via `channels_redis` |
| **Celery Broker** | ✅ Redis for async task queue |
| **Application-level cache** | ⚠️ Not observed - no `@cache` decorators or manual caching |
| **Template caching** | ❌ Not configured |

### React Query (Frontend)

| Setting | Value | Notes |
|---------|-------|-------|
| `staleTime` | 60 seconds | Good - prevents unnecessary refetches |
| `retry` | 1 | Minimal retry on failure |
| `refetchOnWindowFocus` | false | Good - prevents UX disruption |

### WebSocket Performance

| Aspect | Implementation |
|--------|----------------|
| **Reconnection** | Exponential backoff (1s → 30s with jitter) |
| **Heartbeat** | Ping every 25 seconds |
| **Channel groups** | Personal (`agent_<id>`), `agents`, `supervisors` |
| **Message delivery** | 66 `group_send` calls across backend |
| **Cleanup** | Proper cleanup on unmount |

### Celery Task Configuration

| Aspect | Status |
|--------|--------|
| **Retry mechanism** | ✅ `max_retries` configured (2-5 based on task) |
| **Bind=True** | ✅ All critical tasks use `bind=True` for self-reference |
| **Queue separation** | ✅ Separate queues for `calls`, `campaigns` |
| **Result backend** | ✅ `django-db` for persistent results |

### Stress Vulnerabilities

| Issue | Severity | Description |
|-------|----------|-------------|
| **No connection pooling config** | High | No `CONN_MAX_AGE` or pool settings for PostgreSQL |
| **No query result caching** | Medium | Every API call hits DB directly |
| **N+1 on nested serializers** | Medium | Some serializers may trigger extra queries |
| **WS message flooding** | Medium | No rate limiting on WebSocket messages |
| **Large list views** | Medium | Lead/Call list pages load all fields - consider field selection |
| **No background task monitoring** | Low | No Flower or similar Celery monitoring configured |
| **SIP state updates** | Low | Heavy WebSocket traffic during high call volume |

### Recommendations for High Load

1. **Add database connection pooling**:
   ```python
   DATABASES = {
       'default': {
           'CONN_MAX_AGE': 60,
           'OPTIONS': {'pool': True, 'max_connections': 100},
       }
   }
   ```

2. **Implement application-level caching**:
   - Cache frequently accessed lookups (dispositions, stages, statuses)
   - Use `@cache_page` for expensive dashboard aggregations

3. **Add field selection to list views**:
   ```python
   # Allow clients to request only needed fields
   ?fields=id,first_name,phone,stage
   ```

4. **Consider WebSocket message batching** during high-volume periods

5. **Monitor Celery with Flower** for task queue health

6. **Add database query logging** in development to catch N+1 issues early

---

*Review generated: 2026-05-09*