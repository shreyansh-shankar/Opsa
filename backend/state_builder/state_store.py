import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
import uuid
from backend.models.models import (
    Responsibility, Project, Goal, Task, Relationship, Event
)

def parse_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str or dt_str.lower() == "null":
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(dt_str.strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None

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
        if not slug_or_name:
            return None
            
        slugified = slugify(slug_or_name)
        
        # 1. Split by context modifiers if present (-of- or -under-)
        parts = None
        if "-of-" in slugified:
            parts = slugified.split("-of-", 1)
        elif "-under-" in slugified:
            parts = slugified.split("-under-", 1)
            
        if parts:
            name_slug, parent_ref = parts[0], parts[1]
            parent_ent = self.get_entity(parent_ref)
            if parent_ent:
                target_slug = f"{parent_ent['slug']}-{name_slug}"
                return self.entities.get(target_slug)
            return None

        # 2. Try direct lookup by slugified input
        if slugified in self.entities:
            return self.entities[slugified]

        # 3. Check for unique name/display name match
        matches = [ent for ent in self.entities.values() if slugify(ent["name"]) == slugified]
        if len(matches) == 1:
            return matches[0]
        elif len(matches) > 1:
            # Ambiguity detected. Raise ValidationError dynamically to avoid circular import.
            from backend.commands.engine import ValidationError
            options = []
            for m in matches:
                p_slug = m.get("parent_slug")
                p_name = self.entities[p_slug]["name"] if (p_slug and p_slug in self.entities) else None
                if p_name:
                    options.append(f"'{m['name']} OF {p_name}'")
                else:
                    options.append(f"'{m['name']}'")
            raise ValidationError(
                f"Ambiguous name reference '{slug_or_name}'. Did you mean one of these? {', '.join(options)}"
            )

        return None

    def _update_entity_slug(self, old_slug: str, new_slug: str) -> None:
        if old_slug == new_slug:
            return
        
        # 1. Update the entity itself in self.entities
        entity = self.entities.pop(old_slug, None)
        if not entity:
            return
        entity["slug"] = new_slug
        self.entities[new_slug] = entity
        
        # 2. Update relationships
        for rel in self.relationships:
            if rel["source_slug"] == old_slug:
                rel["source_slug"] = new_slug
            if rel["target_slug"] == old_slug:
                rel["target_slug"] = new_slug

        # 3. Update deferred_condition references
        for ent in self.entities.values():
            cond = ent.get("deferred_condition")
            if cond and cond.startswith(f"{old_slug}."):
                ent["deferred_condition"] = cond.replace(f"{old_slug}.", f"{new_slug}.", 1)
                
        # 4. Find all child entities (where parent_slug == old_slug) and recursively update them
        children = [ent for ent in self.entities.values() if ent.get("parent_slug") == old_slug]
        for child in children:
            child_old_slug = child["slug"]
            child["parent_slug"] = new_slug
            # Re-generate child's unique slug using new parent_slug
            child_new_slug = f"{new_slug}-{slugify(child['name'])}"
            self._update_entity_slug(child_old_slug, child_new_slug)

    def apply_event(self, op: str, target: str, payload: dict) -> None:
        """
        Applies a single operation to mutate the in-memory state.
        This is used for both event replay and simulation.
        """
        target_slug = slugify(target)

        if op == "CREATE_RESPONSIBILITY":
            name = payload.get("name", target)
            slug = target_slug
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
            slug = target_slug
            parent_ref = payload.get("parent")
            p_ent = self.get_entity(parent_ref) if parent_ref else None
            parent_slug = p_ent["slug"] if p_ent else None
            self.entities[slug] = {
                "id": payload.get("id"),
                "type": "PROJECT",
                "name": name,
                "slug": slug,
                "status": "NOT_STARTED",
                "base_status": "NOT_STARTED",
                "parent_slug": parent_slug,
                "priority": "MEDIUM",
                "deferred_until": None,
                "deferred_condition": None
            }

        elif op == "CREATE_GOAL":
            name = payload.get("name", target)
            slug = target_slug
            parent_ref = payload.get("parent")
            p_ent = self.get_entity(parent_ref) if parent_ref else None
            parent_slug = p_ent["slug"] if p_ent else None
            self.entities[slug] = {
                "id": payload.get("id"),
                "type": "GOAL",
                "name": name,
                "slug": slug,
                "status": "NOT_STARTED",
                "base_status": "NOT_STARTED",
                "parent_slug": parent_slug,
                "priority": "MEDIUM",
                "deferred_until": None,
                "deferred_condition": None,
                "scheduled_from": None,
                "scheduled_to": None
            }

        elif op == "CREATE_TASK":
            name = payload.get("name", target)
            slug = target_slug
            parent_ref = payload.get("parent")
            p_ent = self.get_entity(parent_ref) if parent_ref else None
            parent_slug = p_ent["slug"] if p_ent else None
            self.entities[slug] = {
                "id": payload.get("id"),
                "type": "TASK",
                "name": name,
                "slug": slug,
                "status": "NOT_STARTED",
                "base_status": "NOT_STARTED",
                "parent_slug": parent_slug,
                "priority": "MEDIUM",
                "deferred_until": None,
                "deferred_condition": None,
                "scheduled_from": None,
                "scheduled_to": None
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
                    parent_slug = entity.get("parent_slug")
                    new_slug = f"{parent_slug}-{slugify(new_name)}" if parent_slug else slugify(new_name)
                    entity["name"] = new_name
                    self._update_entity_slug(old_slug, new_slug)
                    target_slug = new_slug
                    entity = self.entities.get(new_slug) # retrieve from new key
                elif key == "parent":
                    old_slug = entity["slug"]
                    p_ent = self.get_entity(val) if val else None
                    new_parent_slug = p_ent["slug"] if p_ent else None
                    new_slug = f"{new_parent_slug}-{slugify(entity['name'])}" if new_parent_slug else slugify(entity['name'])
                    entity["parent_slug"] = new_parent_slug
                    self._update_entity_slug(old_slug, new_slug)
                    target_slug = new_slug
                    entity = self.entities.get(new_slug) # retrieve from new key
                elif key == "priority":
                    if entity:
                        entity["priority"] = val.upper()
                elif key == "status":
                    if entity:
                        entity["status"] = val.upper()
                        entity["base_status"] = val.upper()
                elif key == "deferred_until":
                    if entity:
                        entity["deferred_until"] = val
                elif key == "deferred_condition":
                    if entity:
                        entity["deferred_condition"] = val
                elif key == "scheduled_from":
                    if entity:
                        entity["scheduled_from"] = None if (not val or val.lower() == "null") else val
                elif key == "scheduled_to":
                    if entity:
                        entity["scheduled_to"] = None if (not val or val.lower() == "null") else val

        elif op == "COMPLETE":
            entity = self.entities.get(target_slug)
            if entity:
                entity["status"] = "COMPLETED"
                entity["base_status"] = "COMPLETED"

        elif op == "DELETE":
            entity = self.entities.get(target_slug)
            if entity:
                # Helper to recursively collect all descendant slugs
                def get_descendants(slug):
                    desc = []
                    for ent in self.entities.values():
                        if ent.get("parent_slug") == slug:
                            desc.append(ent["slug"])
                            desc.extend(get_descendants(ent["slug"]))
                    return desc
                
                to_delete = [target_slug] + get_descendants(target_slug)
                for s in to_delete:
                    if s in self.entities:
                        self.entities[s]["status"] = "DELETED"
                        self.entities[s]["base_status"] = "DELETED"
                        self.entities.pop(s, None)
                    self.relationships = [
                        r for r in self.relationships
                        if r["source_slug"] != s and r["target_slug"] != s
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
            p_ent = self.get_entity(payload.get("blocker", ""))
            blocker_slug = p_ent["slug"] if p_ent else slugify(payload.get("blocker", ""))
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
            src_ent = self.get_entity(payload.get("source", ""))
            tgt_ent = self.get_entity(payload.get("target", ""))
            src = src_ent["slug"] if src_ent else slugify(payload.get("source", ""))
            tgt = tgt_ent["slug"] if tgt_ent else slugify(payload.get("target", ""))
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
            src_ent = self.get_entity(payload.get("source", ""))
            tgt_ent = self.get_entity(payload.get("target", ""))
            src = src_ent["slug"] if src_ent else slugify(payload.get("source", ""))
            tgt = tgt_ent["slug"] if tgt_ent else slugify(payload.get("target", ""))
            self.relationships = [
                r for r in self.relationships
                if not (r["source_slug"] == src and r["target_slug"] == tgt)
            ]

        elif op == "MOVE":
            entity = self.entities.get(target_slug)
            if entity:
                old_slug = entity["slug"]
                p_ent = self.get_entity(payload.get("parent", ""))
                new_parent_slug = p_ent["slug"] if p_ent else None
                new_slug = f"{new_parent_slug}-{slugify(entity['name'])}" if new_parent_slug else slugify(entity['name'])
                entity["parent_slug"] = new_parent_slug
                self._update_entity_slug(old_slug, new_slug)

        elif op == "SCHEDULE":
            entity = self.entities.get(target_slug)
            if entity:
                entity["scheduled_from"] = None if (not payload.get("scheduled_from") or payload.get("scheduled_from").lower() == "null") else payload.get("scheduled_from")
                entity["scheduled_to"] = None if (not payload.get("scheduled_to") or payload.get("scheduled_to").lower() == "null") else payload.get("scheduled_to")

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
                n_slug = f"{parent_slug}-{slugify(name)}" if parent_slug else slugify(name)
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
                    "deferred_condition": None,
                    "scheduled_from": None,
                    "scheduled_to": None
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
            sources_ents = [self.get_entity(s) for s in payload.get("sources", [])]
            sources = [ent["slug"] for ent in sources_ents if ent]
            name = payload.get("name", target)
            
            # Find the parent and type from one of the active sources
            parent_slug = None
            entity_type = "TASK"
            priority = "MEDIUM"
            for ent in sources_ents:
                if ent:
                    parent_slug = ent.get("parent_slug")
                    entity_type = ent.get("type")
                    priority = ent.get("priority", "MEDIUM")
                    break

            # Delete sources
            for src in sources:
                self.entities.pop(src, None)

            tgt_slug = target_slug
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
                "deferred_condition": None,
                "scheduled_from": None,
                "scheduled_to": None
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

    @staticmethod
    def _compute_parent_status(child_statuses: List[str]) -> str:
        """
        Derives a parent entity's status from the statuses of its direct + indirect
        task children using the following priority (highest wins):
          ACTIVE > BLOCKED > DEFERRED > PAUSED > NOT_STARTED > COMPLETED > ARCHIVED

        Special rules:
        - No tasks at all → NOT_STARTED
        - All same status → that status
        - Mix of COMPLETED and anything else → the "anything else" wins per priority
        """
        if not child_statuses:
            return "NOT_STARTED"

        unique = set(child_statuses)
        if len(unique) == 1:
            return unique.pop()

        # Priority order (index 0 = highest priority)
        priority = ["ACTIVE", "BLOCKED", "DEFERRED", "PAUSED", "NOT_STARTED", "COMPLETED", "ARCHIVED"]
        for status in priority:
            if status in unique:
                return status

        return "NOT_STARTED"

    def _collect_task_statuses(self, parent_slug: str) -> List[str]:
        """
        Recursively collect the computed statuses of all TASK descendants
        of the given parent entity.
        """
        statuses: List[str] = []
        for ent in self.entities.values():
            if ent.get("parent_slug") == parent_slug:
                if ent["type"] == "TASK":
                    statuses.append(ent["status"])
                else:
                    # Recurse into child containers (goals inside projects, etc.)
                    statuses.extend(self._collect_task_statuses(ent["slug"]))
        return statuses

    def compute_derived_states(self) -> None:
        """
        1. Resets all entity statuses to base_status.
        2. Evaluates deferral conditions for Tasks.
        3. Computes BLOCKED state for Tasks based on relationship graph.
        4. Rolls up Task statuses bottom-up to Goals → Projects → Responsibilities.

        Goals, Projects, and Responsibilities are read-only in terms of status —
        they are always overwritten by the rollup result.
        """
        for entity in self.entities.values():
            if "base_status" not in entity:
                entity["base_status"] = entity["status"]
            else:
                entity["status"] = entity["base_status"]

        # --- Step 1: Evaluate deferral conditions (Tasks only) ---
        for slug, entity in self.entities.items():
            if entity["type"] != "TASK":
                continue
            if entity["status"] == "DEFERRED":
                # Check deferred_until date
                if entity.get("deferred_until"):
                    try:
                        due = datetime.strptime(entity["deferred_until"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                        if datetime.now(timezone.utc) >= due:
                            entity["status"] = "ACTIVE"
                            entity["base_status"] = "ACTIVE"
                            entity["deferred_until"] = None
                    except ValueError:
                        pass
                # Check deferred_condition (e.g. SomeTask.Completed)
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

        # --- Step 2: Compute BLOCKED state for Tasks ---
        blockers: Dict[str, List[str]] = {}
        for rel in self.relationships:
            if rel["type"] == "blocks":
                blockers.setdefault(rel["target_slug"], []).append(rel["source_slug"])

        for slug, entity in self.entities.items():
            if entity["type"] != "TASK":
                continue
            if entity["status"] in ["ACTIVE", "NOT_STARTED", "PAUSED", "BLOCKED"]:
                active_blockers = [
                    b for b in blockers.get(slug, [])
                    if self.entities.get(b, {}).get("status") not in ["COMPLETED", "DELETED", "ARCHIVED"]
                ]
                if active_blockers:
                    entity["status"] = "BLOCKED"
                elif entity["status"] == "BLOCKED":
                    entity["status"] = entity.get("base_status", "ACTIVE")

        # --- Step 3: Bottom-up rollup — Goals ← Tasks ---
        for slug, entity in self.entities.items():
            if entity["type"] == "GOAL":
                task_statuses = self._collect_task_statuses(slug)
                entity["status"] = self._compute_parent_status(task_statuses)

        # --- Step 4: Bottom-up rollup — Projects ← Goals + direct Tasks ---
        for slug, entity in self.entities.items():
            if entity["type"] == "PROJECT":
                task_statuses = self._collect_task_statuses(slug)
                entity["status"] = self._compute_parent_status(task_statuses)

        # --- Step 5: Bottom-up rollup — Responsibilities ← Projects + direct Tasks ---
        for slug, entity in self.entities.items():
            if entity["type"] == "RESPONSIBILITY":
                task_statuses = self._collect_task_statuses(slug)
                entity["status"] = self._compute_parent_status(task_statuses)

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
                    status=entity["status"],
                    scheduled_from=parse_datetime(entity.get("scheduled_from")),
                    scheduled_to=parse_datetime(entity.get("scheduled_to"))
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
                    scheduled_from=parse_datetime(entity.get("scheduled_from")),
                    scheduled_to=parse_datetime(entity.get("scheduled_to")),
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
