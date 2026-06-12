import unittest
from backend.parser.parser import parse_line, parse_script, ParseError

class TestParser(unittest.TestCase):
    def test_create_commands(self):
        cmd = parse_line("CREATE RESPONSIBILITY Startup")
        self.assertEqual(cmd["operation"], "CREATE_RESPONSIBILITY")
        self.assertEqual(cmd["name"], "Startup")
        self.assertIsNone(cmd["parent"])

        cmd = parse_line("CREATE PROJECT TLD UNDER Startup")
        self.assertEqual(cmd["operation"], "CREATE_PROJECT")
        self.assertEqual(cmd["name"], "TLD")
        self.assertEqual(cmd["parent"], "Startup")

        cmd = parse_line('CREATE TASK "Write Module 3" UNDER LinuxTrack')
        self.assertEqual(cmd["operation"], "CREATE_TASK")
        self.assertEqual(cmd["name"], "Write Module 3")
        self.assertEqual(cmd["parent"], "LinuxTrack")

    def test_update_command(self):
        cmd = parse_line("UPDATE Launch SET priority = HIGH, parent = LandingPage")
        self.assertEqual(cmd["operation"], "UPDATE")
        self.assertEqual(cmd["target"], "Launch")
        self.assertEqual(cmd["updates"], {"priority": "HIGH", "parent": "LandingPage"})

    def test_complete_and_other_actions(self):
        cmd = parse_line("COMPLETE Launch")
        self.assertEqual(cmd["operation"], "COMPLETE")
        self.assertEqual(cmd["target"], "Launch")

        cmd = parse_line("DEFER Launch UNTIL LinuxTrack.Completed")
        self.assertEqual(cmd["operation"], "DEFER")
        self.assertEqual(cmd["target"], "Launch")
        self.assertEqual(cmd["until"], "LinuxTrack.Completed")

        cmd = parse_line("BLOCK Launch WITH landing_page")
        self.assertEqual(cmd["operation"], "BLOCK")
        self.assertEqual(cmd["target"], "Launch")
        self.assertEqual(cmd["blocker"], "landing_page")

        cmd = parse_line("LINK source TO target AS depends_on")
        self.assertEqual(cmd["operation"], "LINK")
        self.assertEqual(cmd["source"], "source")
        self.assertEqual(cmd["target"], "target")
        self.assertEqual(cmd["type"], "depends_on")

    def test_split_and_merge(self):
        cmd = parse_line("SPLIT TaskA INTO TaskB, TaskC")
        self.assertEqual(cmd["operation"], "SPLIT")
        self.assertEqual(cmd["target"], "TaskA")
        self.assertEqual(cmd["names"], ["TaskB", "TaskC"])

        cmd = parse_line("MERGE TaskB, TaskC INTO TaskA")
        self.assertEqual(cmd["operation"], "MERGE")
        self.assertEqual(cmd["sources"], ["TaskB", "TaskC"])
        self.assertEqual(cmd["target"], "TaskA")

    def test_queries(self):
        cmd = parse_line("SHOW ACTIVE")
        self.assertEqual(cmd["operation"], "SHOW_ACTIVE")
        self.assertTrue(cmd["is_query"])

        cmd = parse_line("WHY BLOCKED Launch")
        self.assertEqual(cmd["operation"], "WHY_BLOCKED")
        self.assertEqual(cmd["target"], "Launch")
        self.assertTrue(cmd["is_query"])

    def test_spaces_in_names(self):
        # CREATE unquoted with spaces
        cmd = parse_line("CREATE RESPONSIBILITY The Last Deploy")
        self.assertEqual(cmd["operation"], "CREATE_RESPONSIBILITY")
        self.assertEqual(cmd["name"], "The Last Deploy")
        self.assertIsNone(cmd["parent"])

        cmd = parse_line("CREATE PROJECT Product Engineering UNDER The Last Deploy")
        self.assertEqual(cmd["operation"], "CREATE_PROJECT")
        self.assertEqual(cmd["name"], "Product Engineering")
        self.assertEqual(cmd["parent"], "The Last Deploy")

        # UPDATE with spaces
        cmd = parse_line("UPDATE The Last Deploy SET priority = HIGH")
        self.assertEqual(cmd["operation"], "UPDATE")
        self.assertEqual(cmd["target"], "The Last Deploy")
        self.assertEqual(cmd["updates"], {"priority": "HIGH"})

        # DEFER with spaces
        cmd = parse_line("DEFER Product Engineering UNTIL LinuxTrack.Completed")
        self.assertEqual(cmd["operation"], "DEFER")
        self.assertEqual(cmd["target"], "Product Engineering")
        self.assertEqual(cmd["until"], "LinuxTrack.Completed")

        # BLOCK with spaces
        cmd = parse_line("BLOCK Product Engineering BY Backend Dev")
        self.assertEqual(cmd["operation"], "BLOCK")
        self.assertEqual(cmd["target"], "Product Engineering")
        self.assertEqual(cmd["blocker"], "Backend Dev")

        # LINK with spaces
        cmd = parse_line("LINK Product Engineering TO The Last Deploy AS depends_on")
        self.assertEqual(cmd["operation"], "LINK")
        self.assertEqual(cmd["source"], "Product Engineering")
        self.assertEqual(cmd["target"], "The Last Deploy")
        self.assertEqual(cmd["type"], "depends_on")

        # SPLIT with spaces
        cmd = parse_line("SPLIT Product Engineering INTO Frontend Goal, Backend Goal")
        self.assertEqual(cmd["operation"], "SPLIT")
        self.assertEqual(cmd["target"], "Product Engineering")
        self.assertEqual(cmd["names"], ["Frontend Goal", "Backend Goal"])

        # MERGE with spaces
        cmd = parse_line("MERGE Frontend Goal, Backend Goal INTO Product Engineering")
        self.assertEqual(cmd["operation"], "MERGE")
        self.assertEqual(cmd["sources"], ["Frontend Goal", "Backend Goal"])
        self.assertEqual(cmd["target"], "Product Engineering")

    def test_script_parsing(self):
        script = """
        BEGIN TRANSACTION
        CREATE RESPONSIBILITY Startup
        CREATE PROJECT TLD UNDER Startup
        END TRANSACTION
        """
        cmds, is_txn = parse_script(script)
        self.assertTrue(is_txn)
        self.assertEqual(len(cmds), 2)
        self.assertEqual(cmds[0]["operation"], "CREATE_RESPONSIBILITY")
        self.assertEqual(cmds[1]["operation"], "CREATE_PROJECT")

if __name__ == "__main__":
    unittest.main()
