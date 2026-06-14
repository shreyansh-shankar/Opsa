import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
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
        slug = slugify(name)
        if not slug:
            raise ValidationError("Entity name cannot be empty.")
        if state.get_entity(slug):
            raise ValidationError(f"Entity with name/slug '{name}' already exists.")

        parent = cmd.get("parent")
        if parent:
            parent_ent = state.get_entity(parent)
            if not parent_ent:
                raise ValidationError(f"Parent entity '{parent}' does not exist.")
            
            # Type validations based on hierarchy rules
            if op == "CREATE_PROJECT" and parent_ent["type"] != "RESPONSIBILITY":
                raise ValidationError(f"Project parent '{parent}' must be a RESPONSIBILITY.")
            elif op == "CREATE_GOAL" and parent_ent["type"] != "PROJECT":
                raise ValidationError(f"Goal parent '{parent}' must be a PROJECT.")

    elif op == "UPDATE":
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        
        updates = cmd.get("updates", {})
        for field, val in updates.items():
            if field == "parent":
                if val:
                    p_ent = state.get_entity(val)
                    if not p_ent:
                        raise ValidationError(f"New parent '{val}' does not exist.")
                    # Cycle check for parent pointer
                    p_slug = slugify(val)
                    curr = p_slug
                    while curr:
                        if curr == target_ent["slug"]:
                            raise ValidationError(f"Setting parent to '{val}' creates a parent hierarchy cycle.")
                        curr_ent = state.get_entity(curr)
                        curr = curr_ent.get("parent_slug") if curr_ent else None

        # Verify types and values for scheduled fields if updated
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

    elif op == "DEFER":
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        
        until = cmd["until"]
        # Check condition if it has .Completed format
        if not until:
            raise ValidationError("DEFER requires an UNTIL target.")
        if "." in until:
            cond_ent_name = until.split(".")[0]
            cond_ent = state.get_entity(cond_ent_name)
            if not cond_ent:
                raise ValidationError(f"Deferral condition entity '{cond_ent_name}' does not exist.")

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
        p_slug = slugify(parent)
        curr = p_slug
        while curr:
            if curr == target_ent["slug"]:
                raise ValidationError(f"Moving '{target}' under '{parent}' creates a parent hierarchy cycle.")
            curr_ent = state.get_entity(curr)
            curr = curr_ent.get("parent_slug") if curr_ent else None

    elif op == "SPLIT":
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        names = cmd.get("names", [])
        if not names:
            raise ValidationError("SPLIT requires at least one target name.")
        for name in names:
            slug = slugify(name)
            if state.get_entity(slug) and slug != target_ent["slug"]:
                raise ValidationError(f"Entity '{name}' already exists.")

    elif op == "MERGE":
        sources = cmd.get("sources", [])
        target = cmd["target"]
        if not sources or len(sources) < 2:
            raise ValidationError("MERGE requires at least two source entities.")
        for src in sources:
            src_ent = state.get_entity(src)
            if not src_ent:
                raise ValidationError(f"Source entity '{src}' does not exist.")
        
        tgt_slug = slugify(target)
        if state.get_entity(tgt_slug) and tgt_slug not in [slugify(s) for s in sources]:
            raise ValidationError(f"Target entity '{target}' already exists.")

    elif op == "SCHEDULE":
        target = cmd["target"]
        target_ent = state.get_entity(target)
        if not target_ent:
            raise ValidationError(f"Target entity '{target}' does not exist.")
        if target_ent["type"] not in ["GOAL", "TASK"]:
            raise ValidationError("Only Goals and Tasks can be scheduled.")
        
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
