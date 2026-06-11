# Opsa (MissionOS)

Opsa is a command-driven operational runtime designed for managing commitments, responsibilities, projects, goals, and tasks through declarative, single-line commands and multi-line transactional scripts. It follows an **event-sourced + CQRS** architecture.

---

## Architecture Overview

```text
User Input (Commands / Scripts)
        ↓
Parser Layer (AST conversion)
        ↓
Command Engine (Validation & Cycle Detection)
        ↓
Transaction Manager
        ↓
Event Store (SQLite)
        ↓
State Builder (Chronological Replay)
        ↓
Query Engine (Projections Read Layer)
        ↓
API Layer (FastAPI)
        ↓
Next.js Dashboard
```

---

## Setup & Installation

Ensure you have **Python 3.10+** and **Node.js 18+** installed.

### 1. Backend Setup

1. Navigate to the project root directory.
2. Create a virtual environment:
   ```bash
   python3 -m venv venv
   ```
3. Activate the virtual environment:
   ```bash
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
4. Install python dependencies:
   ```bash
   pip install fastapi uvicorn sqlalchemy pydantic pytest httpx
   ```

### 2. Initialize the Local Database
Opsa stores derived state in a local SQLite database file `opsa.db` at the root. Run the initialization script to generate the event log and projections schemas:
```bash
PYTHONPATH=. venv/bin/python backend/database/init_db.py
```
*(Note: Starting the FastAPI server will also automatically create the database and tables if they do not exist).*

### 3. Frontend Setup

1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```

---

## How to Run

To run Opsa locally, start both the backend API server and frontend development server.

### Start the Backend API
In the root directory, run:
```bash
PYTHONPATH=. venv/bin/uvicorn backend.main:app --port 8000 --reload
```
This runs the API server on `http://localhost:8000`.

### Start the Next.js Frontend
In the `frontend/` directory, run:
```bash
npm run dev -- --port 3000
```
This serves the dashboard on `http://localhost:3000`. Open this URL in your browser to interact with the app.

---

## Running Automated Tests

Opsa has a comprehensive test suite for checking parsing logic, transactions validation, cycle detection, and API endpoints. 

In the root directory, execute:
```bash
PYTHONPATH=. venv/bin/pytest
```

---

## Command Syntax Guide

All state mutations occur by executing commands. Below is a quick cheatsheet (available interactively inside the **Command Reference** tab on the dashboard).

### Structure Creation
* `CREATE RESPONSIBILITY <name>` — Create a top-level domain.
* `CREATE PROJECT <name> UNDER <parent>` — Create a project.
* `CREATE GOAL <name> UNDER <parent>` — Create a goal outcome.
* `CREATE TASK <name> [UNDER <parent>]` — Create a task.

### Priorities & Lifecycles
* `COMPLETE <target>` — Complete a task or goal.
* `PROMOTE <target> / DEMOTE <target>` — Set priority (LOW / MEDIUM / HIGH / URGENT).
* `UPDATE <target> SET <field> = <value>` — Update parameters.
* `DELETE <target>` — Permanently delete an entity.
* `ARCHIVE <target>` / `RESTORE <target>` — Archive or restore.

### Dependencies & Deferrals
* `BLOCK <target> BY <blocker>` — Block a task with another task.
* `UNBLOCK <target>` — Remove blocking dependencies.
* `DEFER <target> UNTIL <date | condition>` — Defer execution.

### Queries
* `SHOW ACTIVE / BLOCKED / DEFERRED / ARCHIVED`
* `WHY BLOCKED <target>` — Renders the recursive blocking tree.
