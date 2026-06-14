from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from backend.database.connection import get_db, engine, Base
from backend.models.models import Responsibility, Project, Goal, Task, Relationship, Event
from backend.commands.engine import execute_transaction_script, ValidationError
from backend.queries.executor import execute_query
from backend.parser.parser import parse_line

# Initialize Database tables and execute safety migrations for SQLite
def run_migrations():
    import sqlite3
    from backend.database.connection import DATABASE_URL
    if DATABASE_URL.startswith("sqlite:///"):
        db_path = DATABASE_URL.replace("sqlite:///", "")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        for table in ["tasks", "goals"]:
            for col in ["scheduled_from", "scheduled_to"]:
                try:
                    cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} DATETIME;")
                except sqlite3.OperationalError:
                    # Column already exists
                    pass
        conn.commit()
        conn.close()

try:
    run_migrations()
except Exception as e:
    print(f"Migration error: {e}")

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Opsa (MissionOS) API", version="1.0.0")

# CORS middleware to allow nextjs app to access api
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CommandRequest(BaseModel):
    command: str

class ScriptRequest(BaseModel):
    script: str

class QueryRequest(BaseModel):
    query: str

@app.post("/api/commands")
def run_command_endpoint(req: CommandRequest, db: Session = Depends(get_db)):
    try:
        res = execute_transaction_script(db, req.command)
        return res
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

@app.post("/api/scripts")
def run_script_endpoint(req: ScriptRequest, db: Session = Depends(get_db)):
    try:
        res = execute_transaction_script(db, req.script)
        return res
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

@app.post("/api/queries")
def run_query_endpoint(req: QueryRequest, db: Session = Depends(get_db)):
    try:
        cmd = parse_line(req.query)
        if not cmd.get("is_query"):
            raise HTTPException(status_code=400, detail="Provided input is not a read query command.")
        res = execute_query(db, cmd)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/state")
def get_state_endpoint(db: Session = Depends(get_db)):
    """
    Builds and returns the nested hierarchal state tree of responsibilities, projects, goals, and tasks.
    """
    resps = db.query(Responsibility).all()
    projs = db.query(Project).all()
    goals = db.query(Goal).all()
    tasks = db.query(Task).all()

    # Maps for indexing
    resp_list = []
    resp_map = {}
    for r in resps:
        r_dict = {
            "id": r.id,
            "name": r.name,
            "slug": r.slug,
            "status": r.status,
            "type": "RESPONSIBILITY",
            "projects": [],
            "tasks": []
        }
        resp_map[r.id] = r_dict
        resp_list.append(r_dict)

    proj_map = {}
    orphan_projects = []
    for p in projs:
        p_dict = {
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "status": p.status,
            "type": "PROJECT",
            "goals": [],
            "tasks": []
        }
        proj_map[p.id] = p_dict
        if p.responsibility_id in resp_map:
            resp_map[p.responsibility_id]["projects"].append(p_dict)
        else:
            orphan_projects.append(p_dict)

    goal_map = {}
    orphan_goals = []
    for g in goals:
        g_dict = {
            "id": g.id,
            "name": g.name,
            "slug": g.slug,
            "status": g.status,
            "type": "GOAL",
            "scheduled_from": g.scheduled_from.isoformat() if g.scheduled_from else None,
            "scheduled_to": g.scheduled_to.isoformat() if g.scheduled_to else None,
            "tasks": []
        }
        goal_map[g.id] = g_dict
        if g.project_id in proj_map:
            proj_map[g.project_id]["goals"].append(g_dict)
        else:
            orphan_goals.append(g_dict)

    orphan_tasks = []
    for t in tasks:
        t_dict = {
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "status": t.status,
            "type": "TASK",
            "priority": t.priority,
            "deferred_until": t.deferred_until.strftime("%Y-%m-%d") if t.deferred_until else None,
            "deferred_condition": t.deferred_condition,
            "scheduled_from": t.scheduled_from.isoformat() if t.scheduled_from else None,
            "scheduled_to": t.scheduled_to.isoformat() if t.scheduled_to else None
        }
        if t.goal_id in goal_map:
            goal_map[t.goal_id]["tasks"].append(t_dict)
        elif t.project_id in proj_map:
            proj_map[t.project_id]["tasks"].append(t_dict)
        elif t.responsibility_id in resp_map:
            resp_map[t.responsibility_id]["tasks"].append(t_dict)
        else:
            orphan_tasks.append(t_dict)

    return {
        "responsibilities": resp_list,
        "orphan_projects": orphan_projects,
        "orphan_goals": orphan_goals,
        "orphan_tasks": orphan_tasks
    }

@app.get("/api/timeline")
def get_timeline_endpoint(db: Session = Depends(get_db)):
    """
    Returns the event history timeline (Git-like log).
    """
    events = db.query(Event).order_by(Event.timestamp.desc()).all()
    return [{
        "id": e.id,
        "timestamp": e.timestamp.isoformat(),
        "transaction_id": e.transaction_id,
        "operation": e.operation,
        "target": e.target,
        "payload": e.payload,
        "status": e.status
    } for e in events]

@app.get("/api/graph")
def get_graph_endpoint(db: Session = Depends(get_db)):
    """
    Returns graph representation of all nodes (entities) and edges (dependencies).
    """
    resps = db.query(Responsibility).all()
    projs = db.query(Project).all()
    goals = db.query(Goal).all()
    tasks = db.query(Task).all()
    rels = db.query(Relationship).all()

    nodes = []
    # Add nodes
    for r in resps:
        nodes.append({"id": r.slug, "label": r.name, "type": "RESPONSIBILITY", "status": r.status})
    for p in projs:
        nodes.append({"id": p.slug, "label": p.name, "type": "PROJECT", "status": p.status})
    for g in goals:
        nodes.append({"id": g.slug, "label": g.name, "type": "GOAL", "status": g.status})
    for t in tasks:
        nodes.append({"id": t.slug, "label": t.name, "type": "TASK", "status": t.status, "priority": t.priority})

    edges = []
    # Add relationship edges
    for r in rels:
        edges.append({
            "source": r.source_slug,
            "target": r.target_slug,
            "type": r.type
        })

    # Add parent-child edges to show hierarchical tree in graph
    for p in projs:
        if p.responsibility_id:
            resp = db.query(Responsibility).filter_by(id=p.responsibility_id).first()
            if resp:
                edges.append({"source": resp.slug, "target": p.slug, "type": "hierarchy"})
    for g in goals:
        if g.project_id:
            proj = db.query(Project).filter_by(id=g.project_id).first()
            if proj:
                edges.append({"source": proj.slug, "target": g.slug, "type": "hierarchy"})
    for t in tasks:
        if t.goal_id:
            goal = db.query(Goal).filter_by(id=t.goal_id).first()
            if goal:
                edges.append({"source": goal.slug, "target": t.slug, "type": "hierarchy"})
        elif t.project_id:
            proj = db.query(Project).filter_by(id=t.project_id).first()
            if proj:
                edges.append({"source": proj.slug, "target": t.slug, "type": "hierarchy"})
        elif t.responsibility_id:
            resp = db.query(Responsibility).filter_by(id=t.responsibility_id).first()
            if resp:
                edges.append({"source": resp.slug, "target": t.slug, "type": "hierarchy"})

    return {
        "nodes": nodes,
        "edges": edges
    }
