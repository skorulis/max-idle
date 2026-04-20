# Product Requirements Document (PRD)

## Project: Max Idle

---

# 1. 📌 Overview

**Max Idle** is a humorous web-based idle game where the primary objective is to *do nothing*. The game rewards players with “idle time” (measured in seconds) simply for existing without interacting. Players periodically collect this accumulated time and will later be able to spend it in a shop.

The experience is intentionally minimal and ironic, pushing the idle game genre to its extreme.

---

# 2. 🎯 Goals & Objectives

## Primary Goals

* Deliver a functional, scalable idle game MVP
* Ensure server-authoritative time tracking (no client-side cheating)
* Support anonymous and registered users
* Enable cross-device persistence via backend storage

## Secondary Goals (Post-MVP)

* Add a shop system for spending idle time
* Introduce achievements and progression hooks
* Explore viral/shareable mechanics

---

# 3. 👤 Target Users

* Casual players looking for novelty or humor
* Users familiar with idle/clicker games
* Social media users (potential viral audience)

---

# 4. 🧠 Core Concept

* Players accumulate **idle time continuously**
* The only meaningful action is **Collect**
* Collecting:

  * Transfers accumulated time into a stored balance
  * Resets the idle timer

---

# 5. 🧩 Core Features (MVP)

## 5.1 Anonymous Play

* Users can start immediately without registration
* Anonymous users are persisted in backend
* Progress is tied to a generated user ID + token

## 5.2 Authentication (Basic)

* Anonymous session via JWT
* Future upgrade path to full account (email/password)

## 5.3 Idle Time Accumulation

* Time accumulates continuously (even when app is closed)
* Calculated using server timestamps only

## 5.4 Collect Mechanic

* Primary action button: “Collect”
* Transfers elapsed time into stored balance
* Resets idle timer

## 5.5 Persistent Player State

* Stored in backend database
* Accessible across devices when logged in

## 5.6 Real-Time UI Feedback

* Idle time visibly increases every second
* Based on last server sync

---

# 6. 🚫 Non-Goals (MVP)

* No complex gameplay loops
* No multiplayer interactions
* No real-time websockets
* No in-depth progression systems
* No monetization

---

# 7. 🏗️ System Architecture

## High-Level Architecture

* Frontend: Single Page Application (SPA)
* Backend: Node.js monolith
* Database: PostgreSQL

## Components

### Frontend

* Displays idle time
* Handles user interaction (Collect)
* Manages auth token

### Backend API

* Authentication (anonymous + future login)
* Player state retrieval
* Idle time calculation
* Collect action processing

### Database

* User records
* Player state records

---

# 8. 🗄️ Data Model

## Users Table

| Field         | Type      | Notes          |
| ------------- | --------- | -------------- |
| id            | UUID      | Primary key    |
| is_anonymous  | BOOLEAN   | Default true   |
| email         | TEXT      | Nullable       |
| password_hash | TEXT      | Nullable       |
| created_at    | TIMESTAMP | Auto-generated |

---

## Player State Table

| Field              		| Type      | Notes                   				|
| ------------------ 		| --------- | ----------------------- 				|
| user_id            		| UUID      | Primary key, FK → users 				|
| last_collected_at  		| TIMESTAMP | Server-controlled       				|
| total_idle_seconds 		| BIGINT    | All time accumulated currency    		|
| spendable_idle_seconds 	| BIGINT    | currency that has been collected    	|
| created_at         		| TIMESTAMP |                         				|
| updated_at         		| TIMESTAMP |                         				|

---

# 9. 🔐 Authentication & Identity

## Anonymous Flow

1. Client requests anonymous session
2. Server creates user + player state
3. Server returns JWT token
4. Client stores token locally

## Upgrade Flow (Future)

* Anonymous account can be converted to registered account
* Email/password added without losing progress

---

# 10. ⚙️ API Requirements

## POST /auth/anonymous

Creates a new anonymous user

**Response**

* userId
* token (JWT)

---

## GET /player

Returns player state

**Response**

* totalIdleSeconds
* collectedIdleSeconds
* lastCollectedAt
* serverTime

---

## POST /player/collect

Collect accumulated idle time

**Server Logic**

* Calculate elapsed time using server clock
* Add to total_idle_seconds and spendable_idle_seconds
* Update last_collected_at

**Response**

* collectedSeconds
* totalIdleSeconds
* lastCollectedAt

---

# 11. 🧮 Time Calculation Logic

## Source of Truth

* All time calculations must be server-side

## Formula

```
elapsed = current_server_time - last_collected_at
```

## Rules

* Never trust client time
* Always use backend timestamps

---

# 12. 🖥️ Frontend Requirements

## Core UI Elements

### Idle Counter

* Displays total idle time (live updating)

### Collect Button

* Triggers `/player/collect`

### Status Messaging

* Reinforces humor and inactivity theme

---

## Client-Side Time Rendering

* UI simulates real-time increase between server syncs
* Uses:

  * Last known server time
  * Client clock delta

---

## Sync Behavior

* Initial load → fetch player state
* After collect → refresh state

---

# 13. 🔒 Security & Anti-Cheat

## Requirements

* All calculations must occur server-side
* No trust in client-provided timestamps
* Authenticated requests via JWT

## Threats Mitigated

* System clock manipulation
* Rapid request spamming (basic mitigation)

---

# 14. ⚠️ Edge Cases

| Scenario                   | Expected Behavior               |
| -------------------------- | ------------------------------- |
| Multiple tabs              | No issue (server authoritative) |
| User clears storage        | Anonymous progress lost         |
| Long inactivity            | Large values supported (BIGINT) |
| Network failure on collect | Retry or fail gracefully        |

---

# 15. 📈 Performance Considerations

## Expected Load

* Frequent reads (`GET /player`)
* Occasional writes (`collect`)

## Optimizations (Future)

* Caching layer (e.g., Redis)
* Rate limiting collect endpoint
* Read replicas if scaling

---

# 16. 🧪 Testing Requirements

## Unit Tests

* Time calculation logic
* Collect endpoint behavior

## Integration Tests

* Auth + player state lifecycle
* Anonymous → persistent flow

## Edge Case Testing

* Long time accumulation
* Multiple rapid collect calls

---

# 17. 🚀 Deployment Strategy

## Initial

* Single Node.js service (monolith)
* Managed PostgreSQL instance

---

# 18. 🔮 Future Enhancements

## Shop System

* Spend idle seconds on upgrades

## Achievements

* Time-based milestones

  * “Idle for 24 hours”
  * “Did nothing for a week”

## Social Features

* Leaderboards
* Shareable stats

---

# 19. 🎭 UX & Tone Guidelines

## Tone

* Dry humor
* Self-aware
* Minimalist

## Examples

* “You are doing nothing. Excellent.”
* “Your productivity remains untouched.”

---

# 20. ✅ Success Metrics

## MVP Success

* Users can accumulate and collect idle time
* No cheating via client manipulation
* Cross-device persistence works

## Post-MVP Indicators

* Return visits
* Average idle duration
* Conversion from anonymous → registered

---

# 21. ⚠️ Risks

## Engagement Risk

* Core loop may be too minimal
* Users may not return

## Mitigation

* Add light humor and progression hooks later

---

# 22. 📌 Summary

Max Idle is a deliberately minimal idle game built around a single mechanic: **doing nothing**. The system must be technically robust (server-authoritative time, persistent identity) while maintaining an intentionally simple and humorous user experience.

The MVP focuses on correctness, simplicity, and extensibility for future features like shops and achievements.

---
