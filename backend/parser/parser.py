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
        
        name = tokens[2]
        parent = None

        # Check for UNDER
        if len(tokens) > 3:
            if tokens[3].upper() != "UNDER":
                raise ParseError(f"Expected 'UNDER' in CREATE command, got '{tokens[3]}'")
            if len(tokens) < 5:
                raise ParseError("UNDER requires a parent entity name.")
            parent = tokens[4]
            if len(tokens) > 5:
                raise ParseError(f"Extra tokens at end of CREATE command: {' '.join(tokens[5:])}")

        return {
            "operation": f"CREATE_{entity_type}",
            "name": name,
            "parent": parent,
            "raw": line_clean
        }

    # UPDATE
    elif first_token == "UPDATE":
        if len(tokens) < 6 or tokens[2].upper() != "SET":
            raise ParseError("UPDATE syntax: UPDATE <target> SET <field> = <value> [, <field2> = <value2> ...]")
        target = tokens[1]
        
        # Parse set pairs
        updates = {}
        idx = 3
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
        if len(tokens) > 2:
            raise ParseError(f"Extra tokens at end of COMPLETE command: {' '.join(tokens[2:])}")
        return {"operation": "COMPLETE", "target": tokens[1], "raw": line_clean}

    # DELETE
    elif first_token == "DELETE":
        if len(tokens) < 2:
            raise ParseError("DELETE command requires a target.")
        if len(tokens) > 2:
            raise ParseError(f"Extra tokens at end of DELETE command: {' '.join(tokens[2:])}")
        return {"operation": "DELETE", "target": tokens[1], "raw": line_clean}

    # ARCHIVE
    elif first_token == "ARCHIVE":
        if len(tokens) < 2:
            raise ParseError("ARCHIVE command requires a target.")
        if len(tokens) > 2:
            raise ParseError(f"Extra tokens at end of ARCHIVE command: {' '.join(tokens[2:])}")
        return {"operation": "ARCHIVE", "target": tokens[1], "raw": line_clean}

    # RESTORE
    elif first_token == "RESTORE":
        if len(tokens) < 2:
            raise ParseError("RESTORE command requires a target.")
        if len(tokens) > 2:
            raise ParseError(f"Extra tokens at end of RESTORE command: {' '.join(tokens[2:])}")
        return {"operation": "RESTORE", "target": tokens[1], "raw": line_clean}

    # PROMOTE
    elif first_token == "PROMOTE":
        if len(tokens) < 2:
            raise ParseError("PROMOTE command requires a target.")
        if len(tokens) > 2:
            raise ParseError(f"Extra tokens at end of PROMOTE command: {' '.join(tokens[2:])}")
        return {"operation": "PROMOTE", "target": tokens[1], "raw": line_clean}

    # DEMOTE
    elif first_token == "DEMOTE":
        if len(tokens) < 2:
            raise ParseError("DEMOTE command requires a target.")
        if len(tokens) > 2:
            raise ParseError(f"Extra tokens at end of DEMOTE command: {' '.join(tokens[2:])}")
        return {"operation": "DEMOTE", "target": tokens[1], "raw": line_clean}

    # DEFER
    elif first_token == "DEFER":
        # DEFER <target> UNTIL <value>
        if len(tokens) < 4 or tokens[2].upper() != "UNTIL":
            raise ParseError("DEFER syntax: DEFER <target> UNTIL <timestamp or condition>")
        if len(tokens) > 4:
            raise ParseError(f"Extra tokens at end of DEFER command: {' '.join(tokens[4:])}")
        return {
            "operation": "DEFER",
            "target": tokens[1],
            "until": tokens[3],
            "raw": line_clean
        }

    # BLOCK
    elif first_token == "BLOCK":
        # BLOCK <target> WITH/BY <blocker>
        if len(tokens) < 4 or tokens[2].upper() not in ["WITH", "BY"]:
            raise ParseError("BLOCK syntax: BLOCK <target> WITH/BY <blocker>")
        if len(tokens) > 4:
            raise ParseError(f"Extra tokens at end of BLOCK command: {' '.join(tokens[4:])}")
        return {
            "operation": "BLOCK",
            "target": tokens[1],
            "blocker": tokens[3],
            "raw": line_clean
        }

    # UNBLOCK
    elif first_token == "UNBLOCK":
        if len(tokens) < 2:
            raise ParseError("UNBLOCK command requires a target.")
        if len(tokens) > 2:
            raise ParseError(f"Extra tokens at end of UNBLOCK command: {' '.join(tokens[2:])}")
        return {"operation": "UNBLOCK", "target": tokens[1], "raw": line_clean}

    # LINK
    elif first_token == "LINK":
        # LINK <source> TO <target> AS <type>
        if len(tokens) < 6 or tokens[2].upper() != "TO" or tokens[4].upper() != "AS":
            raise ParseError("LINK syntax: LINK <source> TO <target> AS <relationship_type>")
        if len(tokens) > 6:
            raise ParseError(f"Extra tokens at end of LINK command: {' '.join(tokens[6:])}")
        return {
            "operation": "LINK",
            "source": tokens[1],
            "target": tokens[3],
            "type": tokens[5].lower(),
            "raw": line_clean
        }

    # UNLINK
    elif first_token == "UNLINK":
        # UNLINK <source> FROM <target>
        if len(tokens) < 4 or tokens[2].upper() != "FROM":
            raise ParseError("UNLINK syntax: UNLINK <source> FROM <target>")
        if len(tokens) > 4:
            raise ParseError(f"Extra tokens at end of UNLINK command: {' '.join(tokens[4:])}")
        return {
            "operation": "UNLINK",
            "source": tokens[1],
            "target": tokens[3],
            "raw": line_clean
        }

    # MOVE
    elif first_token == "MOVE":
        # MOVE <target> UNDER <parent>
        if len(tokens) < 4 or tokens[2].upper() != "UNDER":
            raise ParseError("MOVE syntax: MOVE <target> UNDER <new_parent>")
        if len(tokens) > 4:
            raise ParseError(f"Extra tokens at end of MOVE command: {' '.join(tokens[4:])}")
        return {
            "operation": "MOVE",
            "target": tokens[1],
            "parent": tokens[3],
            "raw": line_clean
        }

    # SPLIT
    elif first_token == "SPLIT":
        # SPLIT <target> INTO <name1> , <name2> ...
        if len(tokens) < 4 or tokens[2].upper() != "INTO":
            raise ParseError("SPLIT syntax: SPLIT <target> INTO <name1>, <name2> ...")
        target = tokens[1]
        
        # Parse comma-separated names
        names = []
        idx = 3
        while idx < len(tokens):
            names.append(tokens[idx])
            idx += 1
            if idx < len(tokens):
                if tokens[idx] == ",":
                    idx += 1
                else:
                    raise ParseError(f"Expected ',' between split names, got '{tokens[idx]}'")
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
        if len(tokens) < 5:
            raise ParseError("MERGE syntax: MERGE <name1>, <name2> INTO <new_name>")
        
        # Parse comma-separated names until INTO
        names = []
        idx = 1
        into_found = False
        while idx < len(tokens):
            if tokens[idx].upper() == "INTO":
                into_found = True
                idx += 1
                break
            names.append(tokens[idx])
            idx += 1
            if idx < len(tokens) and tokens[idx].upper() != "INTO":
                if tokens[idx] == ",":
                    idx += 1
                else:
                    raise ParseError(f"Expected ',' between merge names, got '{tokens[idx]}'")
        
        if not into_found or idx >= len(tokens):
            raise ParseError("Expected 'INTO <new_name>' in MERGE command.")
        
        new_name = tokens[idx]
        if idx + 1 < len(tokens):
            raise ParseError(f"Extra tokens at end of MERGE command: {' '.join(tokens[idx+1:])}")
            
        return {
            "operation": "MERGE",
            "sources": names,
            "target": new_name,
            "raw": line_clean
        }

    # SHOW (Query)
    elif first_token == "SHOW":
        if len(tokens) < 2:
            raise ParseError("SHOW command requires a query type (e.g. SHOW ACTIVE).")
        query_type = tokens[1].upper()
        allowed_queries = [
            "ACTIVE", "BLOCKED", "DEFERRED", "ARCHIVED",
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
        if len(tokens) > 3:
            raise ParseError(f"Extra tokens at end of WHY query: {' '.join(tokens[3:])}")
        return {
            "operation": "WHY_BLOCKED",
            "target": tokens[2],
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
