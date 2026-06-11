from typing import Dict, Any, List
from sqlalchemy.orm import Session
from backend.models.models import (
    Responsibility, Project, Goal, Task, Relationship, Event
)
from backend.state_builder.state_store import slugify

def execute_query(db: Session, cmd: Dict[str, Any]) -> Dict[str, Any]:
    op = cmd["operation"]
    
    if op == "SHOW_ACTIVE":
        res = []
        for r in db.query(Responsibility).filter_by(status="ACTIVE").all():
            res.append({"type": "RESPONSIBILITY", "name": r.name, "slug": r.slug})
        for p in db.query(Project).filter_by(status="ACTIVE").all():
            res.append({"type": "PROJECT", "name": p.name, "slug": p.slug})
        for g in db.query(Goal).filter_by(status="ACTIVE").all():
            res.append({"type": "GOAL", "name": g.name, "slug": g.slug})
        for t in db.query(Task).filter_by(status="ACTIVE").all():
            res.append({"type": "TASK", "name": t.name, "slug": t.slug, "priority": t.priority})
        return {"query": "SHOW ACTIVE", "result": res}

    elif op == "SHOW_BLOCKED":
        res = []
        for t in db.query(Task).filter_by(status="BLOCKED").all():
            res.append({"type": "TASK", "name": t.name, "slug": t.slug, "priority": t.priority})
        for g in db.query(Goal).filter_by(status="BLOCKED").all():
            res.append({"type": "GOAL", "name": g.name, "slug": g.slug})
        for p in db.query(Project).filter_by(status="BLOCKED").all():
            res.append({"type": "PROJECT", "name": p.name, "slug": p.slug})
        for r in db.query(Responsibility).filter_by(status="BLOCKED").all():
            res.append({"type": "RESPONSIBILITY", "name": r.name, "slug": r.slug})
        return {"query": "SHOW BLOCKED", "result": res}

    elif op == "SHOW_DEFERRED":
        res = []
        for t in db.query(Task).filter_by(status="DEFERRED").all():
            res.append({
                "type": "TASK",
                "name": t.name,
                "slug": t.slug,
                "deferred_until": t.deferred_until.isoformat() if t.deferred_until else None,
                "deferred_condition": t.deferred_condition
            })
        return {"query": "SHOW DEFERRED", "result": res}

    elif op == "SHOW_ARCHIVED":
        res = []
        for r in db.query(Responsibility).filter_by(status="ARCHIVED").all():
            res.append({"type": "RESPONSIBILITY", "name": r.name, "slug": r.slug})
        for p in db.query(Project).filter_by(status="ARCHIVED").all():
            res.append({"type": "PROJECT", "name": p.name, "slug": p.slug})
        for g in db.query(Goal).filter_by(status="ARCHIVED").all():
            res.append({"type": "GOAL", "name": g.name, "slug": g.slug})
        for t in db.query(Task).filter_by(status="ARCHIVED").all():
            res.append({"type": "TASK", "name": t.name, "slug": t.slug})
        return {"query": "SHOW ARCHIVED", "result": res}

    elif op == "SHOW_RESPONSIBILITIES":
        res = [{"name": r.name, "slug": r.slug, "status": r.status} for r in db.query(Responsibility).all()]
        return {"query": "SHOW RESPONSIBILITIES", "result": res}

    elif op == "SHOW_PROJECTS":
        res = [{"name": p.name, "slug": p.slug, "status": p.status} for p in db.query(Project).all()]
        return {"query": "SHOW PROJECTS", "result": res}

    elif op == "SHOW_GOALS":
        res = [{"name": g.name, "slug": g.slug, "status": g.status} for g in db.query(Goal).all()]
        return {"query": "SHOW GOALS", "result": res}

    elif op == "SHOW_TASKS":
        res = [{"name": t.name, "slug": t.slug, "status": t.status, "priority": t.priority} for t in db.query(Task).all()]
        return {"query": "SHOW TASKS", "result": res}

    elif op == "SHOW_RECENT":
        events = db.query(Event).order_by(Event.timestamp.desc()).limit(20).all()
        res = [{
            "id": e.id,
            "timestamp": e.timestamp.isoformat(),
            "transaction_id": e.transaction_id,
            "operation": e.operation,
            "target": e.target,
            "payload": e.payload,
            "status": e.status
        } for e in events]
        return {"query": "SHOW RECENT", "result": res}

    elif op == "WHY_BLOCKED":
        target = cmd["target"]
        target_slug = slugify(target)
        
        # We need an in-memory StateStore built from the db elements
        from backend.state_builder.state_store import rebuild_projections
        store = rebuild_projections(db)
        
        tree_lines = build_blocker_tree(store, target_slug)
        tree_str = "\n".join(tree_lines)
        return {
            "query": f"WHY BLOCKED {target}",
            "result": tree_str
        }
        
    return {"query": op, "result": []}

def build_blocker_tree(state, target_slug: str, depth: int = 0, visited: set = None) -> List[str]:
    if visited is None:
        visited = set()
        
    entity = state.get_entity(target_slug)
    if not entity:
        return []
        
    name = entity["name"]
    lines = []
    
    # Indentation prefix
    if depth > 0:
        prefix = " " * (5 * (depth - 1)) + " └── "
        lines.append(f"{prefix}{name}")
    else:
        lines.append(name)
        
    if target_slug in visited:
        return lines
    visited.add(target_slug)
    
    # Find active blockers
    blocker_slugs = []
    for rel in state.relationships:
        if rel["target_slug"] == target_slug and rel["type"] == "blocks":
            blocker_slugs.append(rel["source_slug"])
            
    for b in blocker_slugs:
        # Only recurse if the blocker is not completed
        b_ent = state.get_entity(b)
        if b_ent and b_ent["status"] not in ["COMPLETED", "DELETED", "ARCHIVED"]:
            lines.extend(build_blocker_tree(state, b, depth + 1, visited))
            
    return lines
