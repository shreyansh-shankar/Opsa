import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from backend.models.models import Event, Transaction
from backend.state_builder.state_store import StateStore, rebuild_projections, slugify

class ValidationError(ValueError):
    pass

def check_cycle(entities: Dict[str, Any], relationships: List[Dict[str, Any]], new_src: str, new_tgt: str, rel_type: str) -> bool:
    """
    Checks if adding a relationship (new_src -> new_tgt of type rel_type) creates a cycle of dependency.
    Edges represent dependencies. If A depends on B, path is A -> B.
    """
    temp_rels = list(relationships)
    temp_rels.append({"source_slug": new_src, "target_slug": new_tgt, "type": rel_type})

    # Build adjacency list: node -> list of nodes it depends on
    adj = {}
    for r in temp_rels:
        t = r["type"]
        src = r["source_slug"]
        tgt = r["target_slug"]
        if t == "blocks":
            # src blocks tgt => tgt depends on src. (tgt -> src)
            adj.setdefault(tgt, []).append(src)
        elif t == "depends_on":
            # src depends_on tgt => src depends on tgt. (src -> tgt)
            adj.setdefault(src, []).append(tgt)

    visited = set()
    rec_stack = set()

    def dfs(node):
        if node in rec_stack:
            return True
        if node in visited:
            return False
        visited.add(node)
        rec_stack.add(node)
        for neighbor in adj.get(node, []):
            if dfs(neighbor):
                return True
        rec_stack.remove(node)
        return False

    for node in list(adj.keys()):
        if dfs(node):
            return True
    return False

def validate_command(cmd: Dict[str, Any], state: StateStore) -> None:
    """
    Validates a command against the in-memory state.
    Raises ValidationError if invalid.
    """
    op = cmd["operation"]
    
    if op.startswith("CREATE_"):
        name = cmd["name"]
        parent = cmd.get("parent")
        parent_ent = None
        if parent:
            parent_ent = state.get_entity(parent)
            if not parent_ent:
                raise ValidationError(f"Parent entity '{parent}' does not exist.")
            slug = f"{parent_ent['slug']}-{slugify(name)}"
        else:
            slug = slugify(name)

        if not slug:
            raise ValidationError("Entity name cannot be empty.")
        if state.get_entity(slug):
            raise ValidationError(f"Entity with name/slug '{name}' already exists under parent '{parent}'." if parent else f"Entity with name/slug '{name}' already exists.")

        if parent_ent:
            # Type validations based on hierarchy rules
            if op == "CREATE_PROJECT" and parent_ent["type"] != "RESPONSIBILITY":
                raise ValidationError(f"Project parent '{parent}' must be a RESPONSIBILITY.")
            elif op == "CREATE_GOAL" and parent_ent["type"] != "PROJECT":
                raise ValidationError(f"Goal parent '{parent}' must be a PROJECT.")
        
        # Save the resolved unique slug as target
        cmd["target"] = slug

    elif op == "UPDATE":
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        cmd["target"] = target_ent["slug"]
        
        updates = cmd.get("updates", {})
        for field, val in updates.items():
            if field == "parent":
                if val:
                    p_ent = state.get_entity(val)
                    if not p_ent:
                        raise ValidationError(f"New parent '{val}' does not exist.")
                    p_slug = p_ent["slug"]
                    updates["parent"] = p_slug
                    
                    # Cycle check for parent pointer
                    curr = p_slug
                    while curr:
                        if curr == target_ent["slug"]:
                            raise ValidationError(f"Setting parent to '{val}' creates a parent hierarchy cycle.")
                        curr_ent = state.get_entity(curr)
                        curr = curr_ent.get("parent_slug") if curr_ent else None

        # Verify types and values for scheduled fields if updated
        if "status" in updates:
            if target_ent["type"] != "TASK":
                entity_label = target_ent["type"].capitalize()
                raise ValidationError(
                    f"Cannot manually set 'status' on a {entity_label}. "
                    f"Status of Goals, Projects, and Responsibilities is derived "
                    f"automatically from their tasks."
                )

        if "scheduled_from" in updates or "scheduled_to" in updates:
            if target_ent["type"] not in ["GOAL", "TASK"]:
                raise ValidationError("Only Goals and Tasks can be scheduled.")
            
            from backend.state_builder.state_store import parse_datetime
            
            # Use current state values as fallback
            start_str = updates.get("scheduled_from", target_ent.get("scheduled_from"))
            end_str = updates.get("scheduled_to", target_ent.get("scheduled_to"))
            
            start_dt = parse_datetime(start_str)
            end_dt = parse_datetime(end_str)
            
            if start_str and start_str.lower() != "null" and not start_dt:
                raise ValidationError(f"Invalid start datetime format: '{start_str}'")
            if end_str and end_str.lower() != "null" and not end_dt:
                raise ValidationError(f"Invalid end datetime format: '{end_str}'")
                
            if start_dt and end_dt and start_dt > end_dt:
                raise ValidationError(f"Start datetime '{start_str}' must be before or equal to end datetime '{end_str}'")

    elif op in ["COMPLETE", "DELETE", "ARCHIVE", "RESTORE", "PROMOTE", "DEMOTE", "UNBLOCK", "PAUSE", "START"]:
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        # Lifecycle state commands only apply to Tasks.
        # Goals, Projects, and Responsibilities derive their status from tasks automatically.
        if op in ["COMPLETE", "ARCHIVE", "RESTORE", "PAUSE", "START"] and target_ent["type"] != "TASK":
            entity_label = target_ent["type"].capitalize()
            raise ValidationError(
                f"'{op}' can only be used on Tasks. The {entity_label} '{target_ent['name']}' "
                f"status is derived automatically from its tasks. "
                f"Use {op} on the individual tasks instead."
            )
        cmd["target"] = target_ent["slug"]

    elif op == "DEFER":
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        if target_ent["type"] != "TASK":
            entity_label = target_ent["type"].capitalize()
            raise ValidationError(
                f"'DEFER' can only be used on Tasks. The {entity_label} '{target_ent['name']}' "
                f"status is derived automatically from its tasks."
            )
        cmd["target"] = target_ent["slug"]
        
        until = cmd["until"]
        # Check condition if it has .Completed format
        if not until:
            raise ValidationError("DEFER requires an UNTIL target.")
        if "." in until:
            cond_ent_name = until.split(".")[0]
            cond_ent = state.get_entity(cond_ent_name)
            if not cond_ent:
                raise ValidationError(f"Deferral condition entity '{cond_ent_name}' does not exist.")
            cmd["until"] = f"{cond_ent['slug']}.Completed"

    elif op == "BLOCK":
        target = cmd["target"]
        blocker = cmd["blocker"]
        target_ent = state.get_entity(target)
        blocker_ent = state.get_entity(blocker)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        if not blocker_ent:
            raise ValidationError(f"Blocker entity '{blocker}' does not exist.")
        if target_ent["slug"] == blocker_ent["slug"]:
            raise ValidationError("An entity cannot block itself.")

        cmd["target"] = target_ent["slug"]
        cmd["blocker"] = blocker_ent["slug"]

        # Cycle check
        if check_cycle(state.entities, state.relationships, blocker_ent["slug"], target_ent["slug"], "blocks"):
            raise ValidationError(f"Blocking '{target}' by '{blocker}' creates a dependency cycle.")

    elif op == "LINK":
        src = cmd["source"]
        tgt = cmd["target"]
        rel_type = cmd["type"]
        src_ent = state.get_entity(src)
        tgt_ent = state.get_entity(tgt)
        if not src_ent:
            raise ValidationError(f"Source entity '{src}' does not exist.")
        if not tgt_ent:
            raise ValidationError(f"Target entity '{tgt}' does not exist.")
        if src_ent["slug"] == tgt_ent["slug"]:
            raise ValidationError("Cannot link an entity to itself.")

        cmd["source"] = src_ent["slug"]
        cmd["target"] = tgt_ent["slug"]

        # Cycle check if linking depends_on or blocks
        if rel_type in ["blocks", "depends_on"]:
            if check_cycle(state.entities, state.relationships, src_ent["slug"], tgt_ent["slug"], rel_type):
                raise ValidationError(f"Linking '{src}' to '{tgt}' as '{rel_type}' creates a dependency cycle.")

    elif op == "UNLINK":
        src = cmd["source"]
        tgt = cmd["target"]
        src_ent = state.get_entity(src)
        tgt_ent = state.get_entity(tgt)
        if not src_ent:
            raise ValidationError(f"Source entity '{src}' does not exist.")
        if not tgt_ent:
            raise ValidationError(f"Target entity '{tgt}' does not exist.")

        cmd["source"] = src_ent["slug"]
        cmd["target"] = tgt_ent["slug"]

    elif op == "MOVE":
        target = cmd["target"]
        parent = cmd["parent"]
        target_ent = state.get_entity(target)
        parent_ent = state.get_entity(parent)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        if not parent_ent:
            raise ValidationError(f"Parent entity '{parent}' does not exist.")
        
        # Cycle check
        p_slug = parent_ent["slug"]
        curr = p_slug
        while curr:
            if curr == target_ent["slug"]:
                raise ValidationError(f"Moving '{target}' under '{parent}' creates a parent hierarchy cycle.")
            curr_ent = state.get_entity(curr)
            curr = curr_ent.get("parent_slug") if curr_ent else None

        cmd["target"] = target_ent["slug"]
        cmd["parent"] = parent_ent["slug"]

    elif op == "SPLIT":
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        
        cmd["target"] = target_ent["slug"]
        
        names = cmd.get("names", [])
        if not names:
            raise ValidationError("SPLIT requires at least one target name.")
        for name in names:
            parent_slug = target_ent.get("parent_slug")
            slug = f"{parent_slug}-{slugify(name)}" if parent_slug else slugify(name)
            if state.get_entity(slug) and slug != target_ent["slug"]:
                raise ValidationError(f"Entity '{name}' already exists.")

    elif op == "MERGE":
        sources = cmd.get("sources", [])
        target = cmd["target"]
        if not sources or len(sources) < 2:
            raise ValidationError("MERGE requires at least two source entities.")
        sources_ents = []
        for src in sources:
            src_ent = state.get_entity(src)
            if not src_ent:
                raise ValidationError(f"Source entity '{src}' does not exist.")
            sources_ents.append(src_ent)
        
        # Find parent from one of the active sources
        parent_slug = None
        for ent in sources_ents:
            if ent:
                parent_slug = ent.get("parent_slug")
                break
                
        tgt_slug = f"{parent_slug}-{slugify(target)}" if parent_slug else slugify(target)
        if state.get_entity(tgt_slug) and tgt_slug not in [ent["slug"] for ent in sources_ents if ent]:
            raise ValidationError(f"Target entity '{target}' already exists.")
            
        cmd["name"] = target
        cmd["target"] = tgt_slug
        cmd["sources"] = [ent["slug"] for ent in sources_ents]

    elif op == "SCHEDULE":
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        if target_ent["type"] not in ["GOAL", "TASK"]:
            raise ValidationError("Only Goals and Tasks can be scheduled.")
        
        cmd["target"] = target_ent["slug"]
        
        start_str = cmd.get("scheduled_from")
        end_str = cmd.get("scheduled_to")
        
        from backend.state_builder.state_store import parse_datetime
        
        start_dt = parse_datetime(start_str)
        end_dt = parse_datetime(end_str)
        
        if start_str and start_str.lower() != "null" and not start_dt:
            raise ValidationError(f"Invalid start datetime format: '{start_str}'")
        if end_str and end_str.lower() != "null" and not end_dt:
            raise ValidationError(f"Invalid end datetime format: '{end_str}'")
            
        if start_dt and end_dt and start_dt > end_dt:
            raise ValidationError(f"Start datetime '{start_str}' must be before or equal to end datetime '{end_str}'")

def resolve_datetime_str(val: Optional[str], is_end: bool = False, start_str: Optional[str] = None, entity: Optional[Dict[str, Any]] = None) -> Optional[str]:
    if not val or val.lower() == "null":
        return "null"
    
    import re
    from datetime import datetime, timedelta, timezone
    import calendar

    # Round to 15 mins helper
    def round_dt_to_15_mins(dt: datetime) -> datetime:
        minute = dt.minute
        rounded_minute = int(round(minute / 15.0) * 15)
        if rounded_minute == 60:
            dt = dt.replace(minute=0, second=0, microsecond=0)
            dt += timedelta(hours=1)
        else:
            dt = dt.replace(minute=rounded_minute, second=0, microsecond=0)
        return dt

    val_stripped = val.strip()

    # Check for "NOW"
    if val_stripped.upper() == "NOW":
        dt = round_dt_to_15_mins(datetime.now())
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    # Check if is a duration offset (e.g. "5 days", "72 hours", "10 days")
    duration_match = re.match(r"^(\d+)\s*(day|days|hour|hours|wk|wks|week|weeks|min|mins|minute|minutes)$", val_stripped, re.IGNORECASE)
    if duration_match:
        qty = int(duration_match.group(1))
        unit = duration_match.group(2).lower()
        
        # We need a start datetime to add the offset to
        ref_start_str = start_str
        if not ref_start_str and entity:
            ref_start_str = entity.get("scheduled_from")
            
        if ref_start_str and ref_start_str.lower() != "null":
            start_dt = None
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
                try:
                    s = ref_start_str.replace("T", " ").split("+")[0].strip()
                    start_dt = datetime.strptime(s, fmt)
                    break
                except ValueError:
                    pass
            if not start_dt:
                start_dt = round_dt_to_15_mins(datetime.now())
        else:
            start_dt = round_dt_to_15_mins(datetime.now())
            
        if "day" in unit:
            end_dt = start_dt + timedelta(days=qty)
        elif "hour" in unit:
            end_dt = start_dt + timedelta(hours=qty)
        elif "week" in unit or "wk" in unit:
            end_dt = start_dt + timedelta(weeks=qty)
        else: # minutes
            end_dt = start_dt + timedelta(minutes=qty)
            
        end_dt = round_dt_to_15_mins(end_dt)
        return end_dt.strftime("%Y-%m-%d %H:%M:%S")
        
    # Check if a pure day digit (e.g. "15" or "18")
    if val_stripped.isdigit():
        day_num = int(val_stripped)
        now = datetime.now()
        _, last_day = calendar.monthrange(now.year, now.month)
        if day_num < 1 or day_num > last_day:
            raise ValidationError(f"Day number {day_num} is out of bounds for the current month.")
            
        dt = datetime(now.year, now.month, day_num)
        if is_end:
            dt = dt.replace(hour=23, minute=45, second=0)
        else:
            dt = dt.replace(hour=0, minute=0, second=0)
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    # Try standard and month-day formats
    val_clean = val_stripped.replace("T", " ")
    parsed_dt = None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            parsed_dt = datetime.strptime(val_clean, fmt)
            break
        except ValueError:
            pass
            
    if not parsed_dt:
        months_dict = {
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
            "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
            "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
            "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
        }
        # "June 15" / "Jun 15"
        m = re.match(r"^([a-zA-Z]+)\s+(\d+)$", val_clean, re.IGNORECASE)
        if m:
            mon_name = m.group(1).lower()
            day_num = int(m.group(2))
            if mon_name in months_dict:
                now = datetime.now()
                parsed_dt = datetime(now.year, months_dict[mon_name], day_num)
        # "15 June" / "15 Jun"
        m2 = re.match(r"^(\d+)\s+([a-zA-Z]+)$", val_clean, re.IGNORECASE)
        if m2:
            day_num = int(m2.group(1))
            mon_name = m2.group(2).lower()
            if mon_name in months_dict:
                now = datetime.now()
                parsed_dt = datetime(now.year, months_dict[mon_name], day_num)

    if not parsed_dt:
        return val

    parsed_dt = round_dt_to_15_mins(parsed_dt)
    return parsed_dt.strftime("%Y-%m-%d %H:%M:%S")

def execute_command_string(db: Session, cmd_str: str) -> Dict[str, Any]:
    """
    Parses and executes a single command. Commits event directly.
    """
    from backend.parser.parser import parse_line
    cmd = parse_line(cmd_str)
    if cmd["operation"] == "COMMENT":
        return {"status": "SUCCESS", "message": "Comment processed."}
    
    return execute_transaction_script(db, cmd_str)

def execute_transaction_script(db: Session, script_text: str) -> Dict[str, Any]:
    """
    Executes a transaction script. If any command fails validation,
    rolls back and raises ValidationError.
    If successful, commits all events under a single transaction_id.
    """
    from backend.parser.parser import parse_script
    parsed_cmds, is_txn = parse_script(script_text)
    
    if not parsed_cmds:
        return {"status": "SUCCESS", "message": "Empty transaction."}

    # Load current state from existing events to validate against
    current_state = StateStore()
    events = db.query(Event).filter(Event.status == "SUCCESS").order_by(Event.timestamp).all()
    for e in events:
        current_state.apply_event(e.operation, e.target, e.payload)
    current_state.compute_derived_states()

    # Pre-process scheduling fields to resolve relative/partial values
    for cmd in parsed_cmds:
        op = cmd["operation"]
        if op == "SCHEDULE":
            target = cmd.get("target")
            entity = current_state.get_entity(target) if target else None
            
            resolved_from = resolve_datetime_str(cmd.get("scheduled_from"), is_end=False, entity=entity)
            resolved_to = resolve_datetime_str(cmd.get("scheduled_to"), is_end=True, start_str=resolved_from, entity=entity)
            
            cmd["scheduled_from"] = resolved_from
            cmd["scheduled_to"] = resolved_to
        elif op == "UPDATE":
            target = cmd.get("target")
            entity = current_state.get_entity(target) if target else None
            updates = cmd.get("updates", {})
            
            if "scheduled_from" in updates or "scheduled_to" in updates:
                resolved_from = None
                if "scheduled_from" in updates:
                    resolved_from = resolve_datetime_str(updates["scheduled_from"], is_end=False, entity=entity)
                    updates["scheduled_from"] = resolved_from
                
                if "scheduled_to" in updates:
                    resolved_to = resolve_datetime_str(updates["scheduled_to"], is_end=True, start_str=resolved_from, entity=entity)
                    updates["scheduled_to"] = resolved_to

    # Generate IDs for splits beforehand if needed to avoid random UUID simulation mismatch
    for cmd in parsed_cmds:
        op = cmd["operation"]
        if op == "SPLIT":
            cmd["ids"] = {name: str(uuid.uuid4()) for name in cmd.get("names", [])}
        elif op == "MERGE" or op.startswith("CREATE_"):
            cmd["id"] = str(uuid.uuid4())

    # Simulate execution on in-memory StateStore
    simulated_state = StateStore()
    simulated_state.entities = {k: v.copy() for k, v in current_state.entities.items()}
    simulated_state.relationships = list(current_state.relationships)

    for i, cmd in enumerate(parsed_cmds):
        try:
            validate_command(cmd, simulated_state)
            
            # Apply to simulation state
            target = cmd.get("target") or cmd.get("name") or (cmd.get("sources")[0] if cmd.get("sources") else "")
            payload = {}
            if "name" in cmd: payload["name"] = cmd["name"]
            if "parent" in cmd: payload["parent"] = cmd["parent"]
            if "updates" in cmd: payload["updates"] = cmd["updates"]
            if "until" in cmd: payload["until"] = cmd["until"]
            if "blocker" in cmd: payload["blocker"] = cmd["blocker"]
            if "source" in cmd: payload["source"] = cmd["source"]
            if "type" in cmd: payload["type"] = cmd["type"]
            if "names" in cmd: payload["names"] = cmd["names"]
            if "sources" in cmd: payload["sources"] = cmd["sources"]
            if "id" in cmd: payload["id"] = cmd["id"]
            if "ids" in cmd: payload["ids"] = cmd["ids"]
            if "scheduled_from" in cmd: payload["scheduled_from"] = cmd["scheduled_from"]
            if "scheduled_to" in cmd: payload["scheduled_to"] = cmd["scheduled_to"]
            
            simulated_state.apply_event(cmd["operation"], target, payload)
            simulated_state.compute_derived_states()
        except ValidationError as e:
            raise ValidationError(f"Validation failed on line {i+1} ('{cmd['raw']}'): {str(e)}")

    # If we got here, all commands are validated. Write events atomically.
    txn_id = str(uuid.uuid4()) if is_txn else None
    
    try:
        # Write to Transaction record
        if txn_id:
            txn = Transaction(id=txn_id, status="COMMITTED")
            db.add(txn)
        
        for cmd in parsed_cmds:
            op = cmd["operation"]
            target = cmd.get("target") or cmd.get("name") or (cmd.get("sources")[0] if cmd.get("sources") else "")
            
            payload = {}
            if "name" in cmd: payload["name"] = cmd["name"]
            if "parent" in cmd: payload["parent"] = cmd["parent"]
            if "updates" in cmd: payload["updates"] = cmd["updates"]
            if "until" in cmd: payload["until"] = cmd["until"]
            if "blocker" in cmd: payload["blocker"] = cmd["blocker"]
            if "source" in cmd: payload["source"] = cmd["source"]
            if "type" in cmd: payload["type"] = cmd["type"]
            if "names" in cmd: payload["names"] = cmd["names"]
            if "sources" in cmd: payload["sources"] = cmd["sources"]
            if "id" in cmd: payload["id"] = cmd["id"]
            if "ids" in cmd: payload["ids"] = cmd["ids"]
            if "scheduled_from" in cmd: payload["scheduled_from"] = cmd["scheduled_from"]
            if "scheduled_to" in cmd: payload["scheduled_to"] = cmd["scheduled_to"]

            event = Event(
                transaction_id=txn_id,
                operation=op,
                target=target,
                payload=payload,
                status="SUCCESS"
            )
            db.add(event)
        
        db.commit()
    except Exception as e:
        db.rollback()
        if txn_id:
            # Save a failed transaction record
            fail_db = Session.object_session(txn) if 'txn' in locals() else db
            try:
                t = Transaction(id=txn_id, status="ROLLED_BACK")
                fail_db.add(t)
                fail_db.commit()
            except:
                pass
        raise e

    # Rebuild read projections
    rebuild_projections(db)
    
    return {
        "status": "SUCCESS",
        "transaction_id": txn_id,
        "message": f"Successfully executed {len(parsed_cmds)} commands."
    }
