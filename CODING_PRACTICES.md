# NestJS Backend — Coding Practices & Standards (Generic Version)

## Core Philosophy

### 1. Domain-Driven Organization

Group files by **feature/domain**, not by technical type.

### 2. Simplicity Over Complexity

Use straightforward patterns unless the project truly requires advanced ones.

### 3. Logical Folder Structure

Create new folders only when they improve clarity.

### 4. Scalable, Predictable Codebase

Your folder structure and naming conventions should scale without becoming messy.

---

# 📁 Recommended Folder Structure (Generic)

```
src/
├── common/                    # Global/shared utilities, configs, pipes, interceptors
│   ├── config/
│   ├── pipes/
│   ├── interceptors/
│   ├── filters/
│   └── guards/                # Global guards (optional)
├── utils/                     # Reusable helper functions
│   ├── crypto.util.ts
│   ├── serializer.util.ts
│   └── pagination.util.ts
├── constants/                 # App-wide constants & config values
│   ├── api-response/
│   └── app.constants.ts
├── types/                     # Global TypeScript types & interfaces
│   └── global.types.ts
├── decorators/                # Custom decorators
│   └── roles.decorator.ts
├── strategies/                # Auth Strategies (JWT / OAuth / etc.)
├── modules/                   # Feature-based modules (main architecture)
│   ├── auth/
│   │   ├── dto/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── user/
│   │   ├── dto/
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   └── user.module.ts
│   └── database/
│       ├── database.service.ts
│       └── database.module.ts
└── main.ts
```

---

# Folder Structure Guidelines

## ✔ When to Create a New Folder

* Files belong to **different sub-domains**.
* Improves clarity and discoverability.
* The feature will grow over time.

Examples:

* `dto/` inside feature modules
* `api-response/` inside constants

## ✔ When to Keep Flat Structure

* Only 2–3 related files.
* No meaningful sub-categorization.
* Separation adds complexity.

Examples:

* `utils/` folder with small helpers
* `types/` (flat)

## ✔ When to Nest

Only when it creates **logical clarity**, such as:

* DTOs
* Sub-features within a feature module
* Response messages by domain

---

# Module Architecture Best Practices

Each module follows this pattern:

```
feature/
├── dto/
├── feature.controller.ts
├── feature.service.ts
├── feature.module.ts
```

### Controller Responsibilities

* Routing
* Request validation (via DTOs)
* Returning responses

### Service Responsibilities

* Business logic
* Database queries
* External API interactions

### DTOs

* A folder for organizing request validation objects

---

# 🔧 Utilities — Best Practices

### Principles

* One function = one responsibility
* Avoid classes unless required
* Keep utilities **stateless**
* Utilities should be **generic**, not domain-specific

### Recommended Utilities

* `serializer.util.ts` → Standard API & pagination formatters
* `pagination.util.ts` → Pagination logic
* `crypto.util.ts` → Random strings, hashing, comparison
* `date.util.ts` → Date helpers (optional)

---

# Authentication & Authorization (Generic)

## Use Guards + Decorators

### Decorator example:

```ts
@Roles('ADMIN', 'MODERATOR')
@Get()
```

### Guard example:

* Check JWT or API key
* Validate role permissions
* Validate resource ownership (optional)

## Optional Authorization Helper (Generic)

A utility like `AccessControlUtil` to handle:

* `hasRole(user, roles)`
* `isOwner(user, resourceOwnerId)`
* `validatePermission(user, action)`

This keeps auth logic **centralized**, not scattered across services.

---

# Standard API Response Structure

### Regular Response

```ts
{
  data: T,
  status: number,
  message: string
}
```

### Paginated Response

```ts
{
  data: {
    items: T[],
    pagination: {
      page: number,
      limit: number,
      total: number,
      pages: number,
      hasNext: boolean,
      hasPrev: boolean
    }
  },
  status: number,
  message: string
}
```

---

# 🔡 Naming Conventions

| Type            | Format                 |
| --------------- | ---------------------- |
| Files & Folders | kebab-case             |
| DTOs            | `*.dto.ts`             |
| Utilities       | `*.util.ts`            |
| Constants       | `*.constant.ts`        |
| Enums           | `SCREAMING_SNAKE_CASE` |
| Modules         | `*.module.ts`          |
| Services        | `*.service.ts`         |
| Controllers     | `*.controller.ts`      |

---

# 📚 Import Structure

Order imports like this:

1. NestJS imports
2. Third-party packages
3. Config/constants/types
4. Local modules
5. Type-only imports (`import type`)

Avoid barrel (`index.ts`) imports unless absolutely necessary.

---

# Scalability & Maintainability

### Why This Structure Scales

* Easy to find related code
* Each module remains self-contained
* Adding new features is straightforward
* Consistent patterns across teams

### Future-Proof Patterns

* Domain-first structure
* DTO separation
* Centralized constants
* Flat utilities
* Standard response shape

---

# Maintenance & Updates

### Reasons to Update This Document

* Folder structure updates
* New utility patterns
* New coding conventions
* New architectural decisions
* Replace or add recommended practices

### Suggested Change Log Format

```
Version 1.1 - January 2025
- Improved folder structure explanation
- Added guidelines for imports
- Added auth/role handling patterns
- Updated naming conventions
```