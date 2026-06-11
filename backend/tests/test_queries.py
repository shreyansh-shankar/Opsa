import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database.connection import Base
from backend.commands.engine import execute_transaction_script
from backend.queries.executor import execute_query
from backend.parser.parser import parse_line

class TestQueries(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.db = Session()

        # Seed database
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Startup")
        execute_transaction_script(self.db, "CREATE PROJECT TLD UNDER Startup")
        execute_transaction_script(self.db, "CREATE GOAL LinuxTrack UNDER TLD")
        execute_transaction_script(self.db, "CREATE TASK Module3 UNDER LinuxTrack")
        execute_transaction_script(self.db, "CREATE TASK LandingPage UNDER TLD")
        execute_transaction_script(self.db, "CREATE TASK Launch UNDER TLD")

        execute_transaction_script(self.db, "BLOCK Launch BY LandingPage")
        execute_transaction_script(self.db, "BLOCK LandingPage BY LinuxTrack")
        execute_transaction_script(self.db, "BLOCK LinuxTrack BY Module3")

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def test_show_queries(self):
        cmd = parse_line("SHOW RESPONSIBILITIES")
        res = execute_query(self.db, cmd)
        self.assertEqual(res["query"], "SHOW RESPONSIBILITIES")
        self.assertEqual(len(res["result"]), 1)
        self.assertEqual(res["result"][0]["name"], "Startup")

        cmd = parse_line("SHOW ACTIVE")
        res = execute_query(self.db, cmd)
        self.assertEqual(res["query"], "SHOW ACTIVE")

    def test_why_blocked_query(self):
        cmd = parse_line("WHY BLOCKED Launch")
        res = execute_query(self.db, cmd)
        self.assertEqual(res["query"], "WHY BLOCKED Launch")
        
        # Verify correct tree rendering
        expected_tree = (
            "Launch\n"
            " └── LandingPage\n"
            "      └── LinuxTrack\n"
            "           └── Module3"
        )
        self.assertEqual(res["result"], expected_tree)

if __name__ == "__main__":
    unittest.main()
