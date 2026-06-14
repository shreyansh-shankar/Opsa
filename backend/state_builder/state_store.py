import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
import uuid
from backend.models.models import (
    Responsibility, Project, Goal, Task, Relationship, Event
)

def slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r'[^a-z0-9\-_]', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')

class StateStore:
    def __init__(self):
        # slug -> entity_dict
        self.entities: Dict[str, Dict[str, Any]] = {}
        # list of relationships
        self.relationships: List[Dict[str, Any]] = []

    def get_entity(self, slug_or_name: str) -> Optional[Dict[str, Any]]:
        slug = slugify(slug_or_name)
        return self.entities.get(slug)

    def apply_event(self, op: str, target: str, payload: dict) -> None:
        """
        Applies a single operation to mutate the in-memory state.
        This is used for both event replay and simulation.
        """
        target_slug = slugify(target)

        if op == "CREATE_RESPONSIBILITY":
            name = payload.get("name", target)
            slug = slugify(name)
            self.entities[slug] = {
                "id": payload.get("id"),
                "type": "RESPONSIBILITY",
                "name": name,
                "slug": slug,
                "status": "NOT_STARTED",
                "base_status": "NOT_STARTED",
                "parent_slug": None,
                "priority": "MEDIUM",
                "deferred_until": None,
                "deferred_condition": None
            }

        elif op == "CREATE_PROJECT":
            name = payload.get("name", target)
            slug = slugify(name)
            self.entities[slug] = {
                "id": payload.get("id"),
                "type": "PROJECT",
                "name": name,
                "slug": slug,
                "status": "NOT_STARTED",
                "base_status": "NOT_STARTED",
                "parent_slug": slugify(payload.get("parent", "")),
                "priority": "MEDIUM",
                "deferred_until": None,
                "deferred_condition": None
            }

        elif op == "CREATE_GOAL":
            name = payload.get("name", target)
            slug = slugify(name)
            self.entities[slug] = {
                "id": payload.get("id"),
                "type": "GOAL",
                "name": name,
                "slug": slug,
                "status": "NOT_STARTED",
                "base_status": "NOT_STARTED",
                "parent_slug": slugify(payload.get("parent", "")),
                "priority": "MEDIUM",
                "deferred_until": None,
                "deferred_condition": None
            }

        elif op == "CREATE_TASK":
            name = payload.get("name", target)
            slug = slugify(name)
            self.entities[slug] = {
                "id": payload.get("id"),
                "type": "TASK",
                "name": name,
                "slug": slug,
                "status": "NOT_STARTED",
                "base_status": "NOT_STARTED",
                "parent_slug": slugify(payload.get("parent", "")) if payload.get("parent") else None,
                "priority": "MEDIUM",
                "deferred_until": None,
                "deferred_condition": None
            }

        elif op == "UPDATE":
            entity = self.entities.get(target_slug)
            if not entity:
                return
            updates = payload.get("updates", {})
            for key, val in updates.items():
                if key == "name":
                    old_slug = entity["slug"]
                    new_name = val
                    new_slug = slugify(new_name)
                    entity["name"] = new_name
                    entity["slug"] = new_slug
                    # Re-map in dictionary
                    self.entities[new_slug] = self.entities.pop(old_slug)
                    # Update all child relationships and parent pointers
                    for ent in self.entities.values():
                        if ent.get("parent_slug") == old_slug:
                            ent["parent_slug"] = new_slug
                    for rel in self.relationships:
                        if rel["source_slug"] == old_slug:
                            rel["source_slug"] = new_slug
                        if rel["target_slug"] == old_slug:
                            rel["target_slug"] = new_slug
                    target_slug = new_slug
                elif key == "parent":
                    entity["parent_slug"] = slugify(val) if val else None
                elif key == "priority":
                    entity["priority"] = val.upper()
                elif key == "status":
                    entity["status"] = val.upper()
                    entity["base_status"] = val.upper()
                elif key == "deferred_until":
                    entity["deferred_until"] = val
                elif key == "deferred_condition":
                    entity["deferred_condition"] = val

        elif op == "COMPLETE":
            entity = self.entities.get(target_slug)
            if entity:
                entity["status"] = "COMPLETED"
                entity["base_status"] = "COMPLETED"

        elif op == "DELETE":
            entity = self.entities.get(target_slug)
            if entity:
                entity["status"] = "DELETED"
                entity["base_status"] = "DELETED"
                # Remove target_slug from entities
                self.entities.pop(target_slug, None)
                # Remove relationships involving target_slug
                self.relationships = [
                    r for r in self.relationships
                    if r["source_slug"] != target_slug and r["target_slug"] != target_slug
                ]

        elif op == "ARCHIVE":
            entity = self.entities.get(target_slug)
            if entity:
                entity["status"] = "ARCHIVED"
                entity["base_status"] = "ARCHIVED"

        elif op == "RESTORE":
            entity = self.entities.get(target_slug)
            if entity:
                entity["status"] = "ACTIVE"
                entity["base_status"] = "ACTIVE"

        elif op == "PAUSE":
            entity = self.entities.get(target_slug)
            if entity:
                entity["status"] = "PAUSED"
                entity["base_status"] = "PAUSED"

        elif op == "START":
            entity = self.entities.get(target_slug)
            if entity:
                entity["status"] = "ACTIVE"
                entity["base_status"] = "ACTIVE"

        elif op == "PROMOTE":
            entity = self.entities.get(target_slug)
            if entity:
                levels = ["LOW", "MEDIUM", "HIGH", "URGENT"]
                curr = entity.get("priority", "MEDIUM")
                if curr in levels and levels.index(curr) < len(levels) - 1:
                    entity["priority"] = levels[levels.index(curr) + 1]

        elif op == "DEMOTE":
            entity = self.entities.get(target_slug)
            if entity:
                levels = ["LOW", "MEDIUM", "HIGH", "URGENT"]
                curr = entity.get("priority", "MEDIUM")
                if curr in levels and levels.index(curr) > 0:
                    entity["priority"] = levels[levels.index(curr) - 1]

        elif op == "DEFER":
            entity = self.entities.get(target_slug)
            if entity:
                until = payload.get("until", "")
                # Determine if until is condition or date
                # Let's try parsing date: e.g. YYYY-MM-DD
                is_date = False
                try:
                    datetime.strptime(until, "%Y-%m-%d")
                    is_date = True
                except ValueError:
                    pass
                
                if is_date:
                    entity["deferred_until"] = until
                    entity["deferred_condition"] = None
                else:
                    entity["deferred_condition"] = until
                    entity["deferred_until"] = None
                entity["status"] = "DEFERRED"
                entity["base_status"] = "DEFERRED"

        elif op == "BLOCK":
            blocker_slug = slugify(payload.get("blocker", ""))
            # Create blocker relationship
            self.relationships.append({
                "source_slug": blocker_slug,
                "target_slug": target_slug,
                "type": "blocks"
            })

        elif op == "UNBLOCK":
            # Remove blocks relationships targeting target_slug
            self.relationships = [
                r for r in self.relationships
                if not (r["target_slug"] == target_slug and r["type"] == "blocks")
            ]

        elif op == "LINK":
            src = slugify(payload.get("source", ""))
            tgt = slugify(payload.get("target", ""))
            t = payload.get("type", "related_to")
            # Avoid duplicate relationships
            exists = any(
                r["source_slug"] == src and r["target_slug"] == tgt and r["type"] == t
                for r in self.relationships
            )
            if not exists:
                self.relationships.append({
                    "source_slug": src,
                    "target_slug": tgt,
                    "type": t
                })

        elif op == "UNLINK":
            src = slugify(payload.get("source", ""))
            tgt = slugify(payload.get("target", ""))
            self.relationships = [
                r for r in self.relationships
                if not (r["source_slug"] == src and r["target_slug"] == tgt)
            ]

        elif op == "MOVE":
            entity = self.entities.get(target_slug)
            if entity:
                entity["parent_slug"] = slugify(payload.get("parent", ""))

        elif op == "SPLIT":
            entity = self.entities.get(target_slug)
            if not entity:
                return
            names = payload.get("names", [])
            parent_slug = entity.get("parent_slug")
            entity_type = entity.get("type")
            
            # Archive old task
            entity["status"] = "DELETED"
            self.entities.pop(target_slug, None)

            # Create new tasks
            for name in names:
                n_slug = slugify(name)
                self.entities[n_slug] = {
                    "id": str(uuid.uuid4()) if "ids" not in payload else payload["ids"].get(name),
                    "type": entity_type,
                    "name": name,
                    "slug": n_slug,
                    "status": "NOT_STARTED",
                    "base_status": "NOT_STARTED",
                    "parent_slug": parent_slug,
                    "priority": entity.get("priority", "MEDIUM"),
                    "deferred_until": None,
                    "deferred_condition": None
                }
                # Copy relationships (if A was blocked or blocked others, copy to new split items)
                for rel in list(self.relationships):
                    if rel["target_slug"] == target_slug:
                        self.relationships.append({
                            "source_slug": rel["source_slug"],
                            "target_slug": n_slug,
                            "type": rel["type"]
                        })
                    if rel["source_slug"] == target_slug:
                        self.relationships.append({
                            "source_slug": n_slug,
                            "target_slug": rel["target_slug"],
                            "type": rel["type"]
                        })

            # Clean old relationships
            self.relationships = [
                r for r in self.relationships
                if r["source_slug"] != target_slug and r["target_slug"] != target_slug
            ]

        elif op == "MERGE":
            sources = [slugify(s) for s in payload.get("sources", [])]
            name = payload.get("target", target)
            tgt_slug = slugify(name)
            
            # Find the parent and type from one of the active sources
            parent_slug = None
            entity_type = "TASK"
            priority = "MEDIUM"
            for src in sources:
                ent = self.entities.get(src)
                if ent:
                    parent_slug = ent.get("parent_slug")
                    entity_type = ent.get("type")
                    priority = ent.get("priority", "MEDIUM")
                    break

            # Delete sources
            for src in sources:
                self.entities.pop(src, None)

            # Create target
            self.entities[tgt_slug] = {
                "id": payload.get("id"),
                "type": entity_type,
                "name": name,
                "slug": tgt_slug,
                "status": "NOT_STARTED",
                "base_status": "NOT_STARTED",
                "parent_slug": parent_slug,
                "priority": priority,
                "deferred_until": None,
                "deferred_condition": None
            }

            # Map relationships from sources to new target
            for rel in list(self.relationships):
                if rel["source_slug"] in sources:
                    self.relationships.append({
                        "source_slug": tgt_slug,
                        "target_slug": rel["target_slug"],
                        "type": rel["type"]
                    })
                if rel["target_slug"] in sources:
                    self.relationships.append({
                        "source_slug": rel["source_slug"],
                        "target_slug": tgt_slug,
                        "type": rel["type"]
                    })

            # Clean old relationships
            self.relationships = [
                r for r in self.relationships
                if r["source_slug"] not in sources and r["target_slug"] not in sources
            ]

    def compute_derived_states(self) -> None:
        """
        Calculates computed status (like BLOCKED or DEFERRED) and clears completions.
        This matches dependencies, deadlines, and deferral conditions.
        """
        for entity in self.entities.values():
            if "base_status" not in entity:
                entity["base_status"] = entity["status"]
            else:
                entity["status"] = entity["base_status"]

        # First evaluate deferral conditions
        for slug, entity in self.entities.items():
            if entity["status"] == "DEFERRED":
                # Check deferred_until
                if entity.get("deferred_until"):
                    try:
                        due = datetime.strptime(entity["deferred_until"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                        if datetime.now(timezone.utc) >= due:
                            entity["status"] = "ACTIVE"
                            entity["base_status"] = "ACTIVE"
                            entity["deferred_until"] = None
                    except ValueError:
                        pass
                # Check deferred_condition: e.g. LinuxTrack.Completed
                elif entity.get("deferred_condition"):
                    cond = entity["deferred_condition"].lower()
                    if cond.endswith(".completed"):
                        dep_name = cond.split(".completed")[0]
                        dep_slug = slugify(dep_name)
                        dep_ent = self.entities.get(dep_slug)
                        if dep_ent and dep_ent["status"] == "COMPLETED":
                            entity["status"] = "ACTIVE"
                            entity["base_status"] = "ACTIVE"
                            entity["deferred_condition"] = None

        # Build blocker index: target_slug -> list of blocker_slugs
        blockers: Dict[str, List[str]] = {}
        for rel in self.relationships:
            if rel["type"] == "blocks":
                t = rel["target_slug"]
                s = rel["source_slug"]
                blockers.setdefault(t, []).append(s)

        # Check blocking state
        # A task is blocked if it is not completed/archived/deleted AND any of its blockers is NOT completed/deleted
        # Since blocking can propagate, we do this iteratively or recursively.
        # But simpler: check if any blocker is not completed/deleted
        for slug, entity in self.entities.items():
            if entity["status"] in ["ACTIVE", "NOT_STARTED", "PAUSED", "BLOCKED"]:
                active_blockers = []
                for b_slug in blockers.get(slug, []):
                    b_ent = self.entities.get(b_slug)
                    if b_ent and b_ent["status"] not in ["COMPLETED", "DELETED", "ARCHIVED"]:
                        active_blockers.append(b_slug)
                if active_blockers:
                    entity["status"] = "BLOCKED"
                else:
                    if entity["status"] == "BLOCKED":
                        entity["status"] = entity.get("base_status", "ACTIVE")

    def write_to_db(self, db: Session) -> None:
        """
        Deletes all current projections and writes the new in-memory state.
        This guarantees read projections match derived event state perfectly.
        """
        # Clear tables
        db.query(Relationship).delete()
        db.query(Task).delete()
        db.query(Goal).delete()
        db.query(Project).delete()
        db.query(Responsibility).delete()
        db.commit()

        # Insert responsibilities
        resp_map = {}
        for slug, entity in self.entities.items():
            if entity["type"] == "RESPONSIBILITY":
                r = Responsibility(
                    id=entity["id"] or str(uuid.uuid4()),
                    name=entity["name"],
                    slug=entity["slug"],
                    status=entity["status"]
                )
                db.add(r)
                resp_map[slug] = r

        # Insert projects
        proj_map = {}
        for slug, entity in self.entities.items():
            if entity["type"] == "PROJECT":
                parent_r = resp_map.get(entity["parent_slug"])
                p = Project(
                    id=entity["id"] or str(uuid.uuid4()),
                    responsibility_id=parent_r.id if parent_r else None,
                    name=entity["name"],
                    slug=entity["slug"],
                    status=entity["status"]
                )
                db.add(p)
                proj_map[slug] = p

        # Insert goals
        goal_map = {}
        for slug, entity in self.entities.items():
            if entity["type"] == "GOAL":
                parent_p = proj_map.get(entity["parent_slug"])
                g = Goal(
                    id=entity["id"] or str(uuid.uuid4()),
                    project_id=parent_p.id if parent_p else None,
                    name=entity["name"],
                    slug=entity["slug"],
                    status=entity["status"]
                )
                db.add(g)
                goal_map[slug] = g

        db.commit()

        # Insert tasks
        for slug, entity in self.entities.items():
            if entity["type"] == "TASK":
                parent_slug = entity["parent_slug"]
                
                # Check parent type
                g_id, p_id, r_id = None, None, None
                if parent_slug:
                    parent_ent = self.entities.get(parent_slug)
                    if parent_ent:
                        p_type = parent_ent["type"]
                        if p_type == "GOAL":
                            goal_obj = goal_map.get(parent_slug)
                            g_id = goal_obj.id if goal_obj else None
                        elif p_type == "PROJECT":
                            proj_obj = proj_map.get(parent_slug)
                            p_id = proj_obj.id if proj_obj else None
                        elif p_type == "RESPONSIBILITY":
                            resp_obj = resp_map.get(parent_slug)
                            r_id = resp_obj.id if resp_obj else None
                
                def_until = None
                if entity.get("deferred_until"):
                    try:
                        def_until = datetime.strptime(entity["deferred_until"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    except ValueError:
                        pass
                
                t = Task(
                    id=entity["id"] or str(uuid.uuid4()),
                    goal_id=g_id,
                    project_id=p_id,
                    responsibility_id=r_id,
                    name=entity["name"],
                    slug=entity["slug"],
                    status=entity["status"],
                    deferred_until=def_until,
                    deferred_condition=entity.get("deferred_condition"),
                    priority=entity.get("priority", "MEDIUM")
                )
                db.add(t)

        # Insert relationships
        for rel in self.relationships:
            r = Relationship(
                source_slug=rel["source_slug"],
                target_slug=rel["target_slug"],
                type=rel["type"]
            )
            db.add(r)

        db.commit()

def rebuild_projections(db: Session) -> StateStore:
    """
    Reads all successful events in order, applies them to StateStore, and writes projections.
    """
    events = db.query(Event).filter(Event.status == "SUCCESS").order_by(Event.timestamp).all()
    store = StateStore()
    for e in events:
        store.apply_event(e.operation, e.target, e.payload)
    
    store.compute_derived_states()
    store.write_to_db(db)
    return store
