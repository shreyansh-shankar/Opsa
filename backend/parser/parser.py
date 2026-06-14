import re
from typing import List, Dict, Any, Tuple

class ParseError(ValueError):
    pass

def tokenize(line: str) -> List[str]:
    # Regex matching quoted strings, individual operators/punctuation like = or , and non-punctuation words
    pattern = r'"([^"]*)"|\'([^\']*)\'|(=)|(,)|([^=\s,]+)'
    tokens = []
    for match in re.finditer(pattern, line):
        q1, q2, eq, comma, unq = match.groups()
        if q1 is not None:
            tokens.append(q1)
        elif q2 is not None:
            tokens.append(q2)
        elif eq is not None:
            tokens.append(eq)
        elif comma is not None:
            tokens.append(comma)
        elif unq is not None:
            tokens.append(unq)
    return tokens

def parse_line(line: str) -> Dict[str, Any]:
    line_clean = line.strip()
    if not line_clean or line_clean.startswith("#"):
        return {"operation": "COMMENT", "raw": line}

    tokens = tokenize(line_clean)
    if not tokens:
        return {"operation": "COMMENT", "raw": line}

    first_token = tokens[0].upper()

    # CREATE
    if first_token == "CREATE":
        if len(tokens) < 3:
            raise ParseError("CREATE command requires an entity type and a name.")
        entity_type = tokens[1].upper()
        if entity_type not in ["RESPONSIBILITY", "PROJECT", "GOAL", "TASK"]:
            raise ParseError(f"Unknown entity type: {entity_type}")
        
        # Scan for UNDER
        under_idx = -1
        for i in range(2, len(tokens)):
            if tokens[i].upper() == "UNDER":
                under_idx = i
                break
        
        if under_idx != -1:
            name_tokens = tokens[2:under_idx]
            parent_tokens = tokens[under_idx+1:]
            if not name_tokens:
                raise ParseError("CREATE command requires a name before UNDER.")
            if not parent_tokens:
                raise ParseError("UNDER requires a parent entity name.")
            name = " ".join(name_tokens)
            parent = " ".join(parent_tokens)
        else:
            name_tokens = tokens[2:]
            if not name_tokens:
                raise ParseError("CREATE command requires a name.")
            name = " ".join(name_tokens)
            parent = None

        return {
            "operation": f"CREATE_{entity_type}",
            "name": name,
            "parent": parent,
            "raw": line_clean
        }

    # UPDATE
    elif first_token == "UPDATE":
        set_idx = -1
        for i in range(1, len(tokens)):
            if tokens[i].upper() == "SET":
                set_idx = i
                break
        
        if set_idx == -1 or set_idx < 2:
            raise ParseError("UPDATE syntax: UPDATE <target> SET <field> = <value> [, <field2> = <value2> ...]")
        
        target = " ".join(tokens[1:set_idx])
        
        # Parse set pairs
        updates = {}
        idx = set_idx + 1
        while idx < len(tokens):
            field = tokens[idx]
            if idx + 2 >= len(tokens) or tokens[idx+1] != "=":
                raise ParseError(f"Expected '=' after field '{field}'")
            value = tokens[idx+2]
            updates[field.lower()] = value
            
            idx += 3
            if idx < len(tokens):
                if tokens[idx] == ",":
                    idx += 1
                else:
                    raise ParseError(f"Expected ',' between update pairs, got '{tokens[idx]}'")
        
        return {
            "operation": "UPDATE",
            "target": target,
            "updates": updates,
            "raw": line_clean
        }

    # COMPLETE
    elif first_token == "COMPLETE":
        if len(tokens) < 2:
            raise ParseError("COMPLETE command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "COMPLETE", "target": target, "raw": line_clean}

    # DELETE
    elif first_token == "DELETE":
        if len(tokens) < 2:
            raise ParseError("DELETE command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "DELETE", "target": target, "raw": line_clean}

    # ARCHIVE
    elif first_token == "ARCHIVE":
        if len(tokens) < 2:
            raise ParseError("ARCHIVE command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "ARCHIVE", "target": target, "raw": line_clean}

    # RESTORE
    elif first_token == "RESTORE":
        if len(tokens) < 2:
            raise ParseError("RESTORE command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "RESTORE", "target": target, "raw": line_clean}

    # PAUSE
    elif first_token == "PAUSE":
        if len(tokens) < 2:
            raise ParseError("PAUSE command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "PAUSE", "target": target, "raw": line_clean}

    # START
    elif first_token == "START":
        if len(tokens) < 2:
            raise ParseError("START command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "START", "target": target, "raw": line_clean}

    # PROMOTE
    elif first_token == "PROMOTE":
        if len(tokens) < 2:
            raise ParseError("PROMOTE command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "PROMOTE", "target": target, "raw": line_clean}

    # DEMOTE
    elif first_token == "DEMOTE":
        if len(tokens) < 2:
            raise ParseError("DEMOTE command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "DEMOTE", "target": target, "raw": line_clean}

    # DEFER
    elif first_token == "DEFER":
        # DEFER <target> UNTIL <value>
        until_idx = -1
        for i in range(1, len(tokens)):
            if tokens[i].upper() == "UNTIL":
                until_idx = i
                break
        if until_idx == -1 or until_idx < 2:
            raise ParseError("DEFER syntax: DEFER <target> UNTIL <timestamp or condition>")
        
        target = " ".join(tokens[1:until_idx])
        until = " ".join(tokens[until_idx+1:])
        if not until:
            raise ParseError("DEFER command requires a target value after UNTIL.")
        
        return {
            "operation": "DEFER",
            "target": target,
            "until": until,
            "raw": line_clean
        }

    # BLOCK
    elif first_token == "BLOCK":
        # BLOCK <target> WITH/BY <blocker>
        delim_idx = -1
        for i in range(1, len(tokens)):
            if tokens[i].upper() in ["WITH", "BY"]:
                delim_idx = i
                break
        if delim_idx == -1 or delim_idx < 2:
            raise ParseError("BLOCK syntax: BLOCK <target> WITH/BY <blocker>")
        
        target = " ".join(tokens[1:delim_idx])
        blocker = " ".join(tokens[delim_idx+1:])
        if not blocker:
            raise ParseError("BLOCK command requires a blocker after WITH/BY.")
        
        return {
            "operation": "BLOCK",
            "target": target,
            "blocker": blocker,
            "raw": line_clean
        }

    # UNBLOCK
    elif first_token == "UNBLOCK":
        if len(tokens) < 2:
            raise ParseError("UNBLOCK command requires a target.")
        target = " ".join(tokens[1:])
        return {"operation": "UNBLOCK", "target": target, "raw": line_clean}

    # LINK
    elif first_token == "LINK":
        # LINK <source> TO <target> AS <type>
        to_idx = -1
        as_idx = -1
        for i in range(1, len(tokens)):
            if tokens[i].upper() == "TO" and to_idx == -1:
                to_idx = i
            elif tokens[i].upper() == "AS" and as_idx == -1:
                as_idx = i
        
        if to_idx == -1 or as_idx == -1 or to_idx < 2 or as_idx <= to_idx + 1 or as_idx + 1 >= len(tokens):
            raise ParseError("LINK syntax: LINK <source> TO <target> AS <relationship_type>")
        
        source = " ".join(tokens[1:to_idx])
        target = " ".join(tokens[to_idx+1:as_idx])
        relationship_type = " ".join(tokens[as_idx+1:]).lower()
        
        return {
            "operation": "LINK",
            "source": source,
            "target": target,
            "type": relationship_type,
            "raw": line_clean
        }

    # UNLINK
    elif first_token == "UNLINK":
        # UNLINK <source> FROM <target>
        from_idx = -1
        for i in range(1, len(tokens)):
            if tokens[i].upper() == "FROM":
                from_idx = i
                break
        if from_idx == -1 or from_idx < 2 or from_idx + 1 >= len(tokens):
            raise ParseError("UNLINK syntax: UNLINK <source> FROM <target>")
        
        source = " ".join(tokens[1:from_idx])
        target = " ".join(tokens[from_idx+1:])
        
        return {
            "operation": "UNLINK",
            "source": source,
            "target": target,
            "raw": line_clean
        }

    # MOVE
    elif first_token == "MOVE":
        # MOVE <target> UNDER <parent>
        under_idx = -1
        for i in range(1, len(tokens)):
            if tokens[i].upper() == "UNDER":
                under_idx = i
                break
        if under_idx == -1 or under_idx < 2 or under_idx + 1 >= len(tokens):
            raise ParseError("MOVE syntax: MOVE <target> UNDER <new_parent>")
        
        target = " ".join(tokens[1:under_idx])
        parent = " ".join(tokens[under_idx+1:])
        
        return {
            "operation": "MOVE",
            "target": target,
            "parent": parent,
            "raw": line_clean
        }

    # SPLIT
    elif first_token == "SPLIT":
        # SPLIT <target> INTO <name1> , <name2> ...
        into_idx = -1
        for i in range(1, len(tokens)):
            if tokens[i].upper() == "INTO":
                into_idx = i
                break
        if into_idx == -1 or into_idx < 2 or into_idx + 1 >= len(tokens):
            raise ParseError("SPLIT syntax: SPLIT <target> INTO <name1>, <name2> ...")
        
        target = " ".join(tokens[1:into_idx])
        
        # Parse names separated by commas
        names = []
        current_name_tokens = []
        for i in range(into_idx + 1, len(tokens)):
            t = tokens[i]
            if t == ",":
                name = " ".join(current_name_tokens).strip()
                if not name:
                    raise ParseError("Empty name in SPLIT list.")
                names.append(name)
                current_name_tokens = []
            else:
                current_name_tokens.append(t)
        
        if current_name_tokens:
            name = " ".join(current_name_tokens).strip()
            if name:
                names.append(name)
        
        if not names:
            raise ParseError("SPLIT requires at least one target name in the INTO clause.")
            
        return {
            "operation": "SPLIT",
            "target": target,
            "names": names,
            "raw": line_clean
        }

    # MERGE
    elif first_token == "MERGE":
        # MERGE <name1> , <name2> INTO <new_name>
        into_idx = -1
        for i in range(1, len(tokens)):
            if tokens[i].upper() == "INTO":
                into_idx = i
                break
        if into_idx == -1 or into_idx < 4 or into_idx + 1 >= len(tokens):
            raise ParseError("MERGE syntax: MERGE <name1>, <name2> ... INTO <new_name>")
        
        # Parse source names separated by commas
        sources = []
        current_name_tokens = []
        for i in range(1, into_idx):
            t = tokens[i]
            if t == ",":
                name = " ".join(current_name_tokens).strip()
                if not name:
                    raise ParseError("Empty name in MERGE list.")
                sources.append(name)
                current_name_tokens = []
            else:
                current_name_tokens.append(t)
        
        if current_name_tokens:
            name = " ".join(current_name_tokens).strip()
            if name:
                sources.append(name)
                
        if len(sources) < 2:
            raise ParseError("MERGE requires at least two source entities.")
            
        new_name = " ".join(tokens[into_idx+1:])
        if not new_name:
            raise ParseError("MERGE requires a target name after INTO.")
            
        return {
            "operation": "MERGE",
            "sources": sources,
            "target": new_name,
            "raw": line_clean
        }

    # SHOW (Query)
    elif first_token == "SHOW":
        if len(tokens) < 2:
            raise ParseError("SHOW command requires a query type (e.g. SHOW ACTIVE).")
        query_type = tokens[1].upper()
        if query_type == "NOT" and len(tokens) == 3 and tokens[2].upper() == "STARTED":
            query_type = "NOT_STARTED"
            tokens = [tokens[0], "NOT_STARTED"]
        allowed_queries = [
            "ACTIVE", "BLOCKED", "DEFERRED", "ARCHIVED", "PAUSED", "NOT_STARTED",
            "RESPONSIBILITIES", "PROJECTS", "GOALS", "TASKS", "RECENT"
        ]
        if query_type not in allowed_queries:
            raise ParseError(f"Unknown SHOW query: SHOW {query_type}. Allowed: {', '.join(allowed_queries)}")
        if len(tokens) > 2:
            raise ParseError(f"Extra tokens at end of SHOW command: {' '.join(tokens[2:])}")
        return {
            "operation": f"SHOW_{query_type}",
            "is_query": True,
            "raw": line_clean
        }

    # WHY (Query)
    elif first_token == "WHY":
        if len(tokens) < 3 or tokens[1].upper() != "BLOCKED":
            raise ParseError("WHY query syntax: WHY BLOCKED <target>")
        target = " ".join(tokens[2:])
        return {
            "operation": "WHY_BLOCKED",
            "target": target,
            "is_query": True,
            "raw": line_clean
        }

    else:
        raise ParseError(f"Unknown command: '{first_token}'")


def parse_script(script_text: str) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Parses a full multi-line transaction script or queries.
    Returns:
      List of parsed commands (AST), and is_transaction (bool)
    """
    lines = script_text.strip().split("\n")
    # Clean and filter lines, keeping comments for audit but executing only actual commands
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            cleaned_lines.append((line, stripped))

    if not cleaned_lines:
        return [], False

    # Check for BEGIN TRANSACTION / END TRANSACTION
    is_transaction = False
    first_clean_line_upper = cleaned_lines[0][1].upper()
    last_clean_line_upper = cleaned_lines[-1][1].upper()

    if first_clean_line_upper == "BEGIN TRANSACTION":
        if last_clean_line_upper != "END TRANSACTION":
            raise ParseError("BEGIN TRANSACTION has no matching END TRANSACTION.")
        is_transaction = True
        body_lines = cleaned_lines[1:-1]
    else:
        if last_clean_line_upper == "END TRANSACTION":
            raise ParseError("END TRANSACTION has no matching BEGIN TRANSACTION.")
        body_lines = cleaned_lines

    parsed_commands = []
    for raw_line, clean_line in body_lines:
        parsed_commands.append(parse_line(clean_line))

    return parsed_commands, is_transaction
