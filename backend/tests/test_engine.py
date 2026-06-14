import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database.connection import Base
from backend.models.models import Event, Transaction, Task, Goal, Project, Responsibility, Relationship
from backend.commands.engine import execute_transaction_script, ValidationError
from backend.state_builder.state_store import rebuild_projections

class TestEngine(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite database for testing
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.db = Session()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def test_single_commands(self):
        # Create a responsibility
        res = execute_transaction_script(self.db, "CREATE RESPONSIBILITY Startup")
        self.assertEqual(res["status"], "SUCCESS")

        # Verify database projection is updated
        resp = self.db.query(Responsibility).filter_by(slug="startup").first()
        self.assertIsNotNone(resp)
        self.assertEqual(resp.name, "Startup")

        # Create project under responsibility
        res = execute_transaction_script(self.db, "CREATE PROJECT TLD UNDER Startup")
        self.assertEqual(res["status"], "SUCCESS")
        
        # Re-query resp since the rebuild deleted/recreated all records
        resp = self.db.query(Responsibility).filter_by(slug="startup").first()
        proj = self.db.query(Project).filter_by(slug="tld").first()
        self.assertIsNotNone(proj)
        self.assertEqual(proj.responsibility_id, resp.id)

    def test_cycle_detection(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Health")
        execute_transaction_script(self.db, "CREATE PROJECT Workout UNDER Health")
        execute_transaction_script(self.db, "CREATE GOAL Running UNDER Workout")
        execute_transaction_script(self.db, "CREATE TASK Run5K UNDER Running")
        execute_transaction_script(self.db, "CREATE TASK BuyShoes UNDER Running")

        # Add dependency: Run5K depends on BuyShoes (BuyShoes blocks Run5K)
        execute_transaction_script(self.db, "BLOCK Run5K BY BuyShoes")

        # Adding dependency: BuyShoes depends on Run5K (Run5K blocks BuyShoes) should fail (cycle)
        with self.assertRaises(ValidationError) as ctx:
            execute_transaction_script(self.db, "BLOCK BuyShoes BY Run5K")
        self.assertIn("dependency cycle", str(ctx.exception))

    def test_transaction_rollback(self):
        script = """
        BEGIN TRANSACTION
        CREATE RESPONSIBILITY Startup
        CREATE PROJECT TLD UNDER Startup
        CREATE GOAL LinuxTrack UNDER NonExistentParent
        END TRANSACTION
        """
        # Should raise validation error on non-existent parent
        with self.assertRaises(ValidationError) as ctx:
            execute_transaction_script(self.db, script)
        self.assertIn("does not exist", str(ctx.exception))

        # Verify no entities were created (atomicity check)
        resps = self.db.query(Responsibility).all()
        self.assertEqual(len(resps), 0)

        # Verify no events were written
        events = self.db.query(Event).all()
        self.assertEqual(len(events), 0)

    def test_state_propagation_and_deferral(self):
        # Test status propagation when blocked or deferred
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Startup")
        execute_transaction_script(self.db, "CREATE PROJECT TLD UNDER Startup")
        execute_transaction_script(self.db, "CREATE GOAL LinuxTrack UNDER TLD")
        execute_transaction_script(self.db, "CREATE TASK TaskA UNDER LinuxTrack")
        execute_transaction_script(self.db, "CREATE TASK TaskB UNDER LinuxTrack")

        # Start TaskB
        execute_transaction_script(self.db, "START TaskB")
        # Block TaskB with TaskA
        execute_transaction_script(self.db, "BLOCK TaskB BY TaskA")
        # TaskB should be BLOCKED
        task_b = self.db.query(Task).filter_by(slug="taskb").first()
        self.assertEqual(task_b.status, "BLOCKED")

        # Complete TaskA
        execute_transaction_script(self.db, "COMPLETE TaskA")
        # TaskB should now be ACTIVE because TaskA is completed
        task_b = self.db.query(Task).filter_by(slug="taskb").first()
        self.assertEqual(task_b.status, "ACTIVE")

        # Defer TaskB until a condition
        execute_transaction_script(self.db, "DEFER TaskB UNTIL TaskA.Completed")
        # Since TaskA is already completed, it shouldn't defer or immediately clear.
        # Let's check state store evaluation
        task_b = self.db.query(Task).filter_by(slug="taskb").first()
        self.assertEqual(task_b.status, "ACTIVE")

    def test_split_and_merge(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Startup")
        execute_transaction_script(self.db, "CREATE PROJECT TLD UNDER Startup")
        execute_transaction_script(self.db, "CREATE GOAL LinuxTrack UNDER TLD")
        execute_transaction_script(self.db, "CREATE TASK TaskA UNDER LinuxTrack")

        # Split TaskA into TaskB, TaskC
        execute_transaction_script(self.db, "SPLIT TaskA INTO TaskB, TaskC")
        
        # TaskA should be deleted/removed, TaskB and TaskC should be created under LinuxTrack
        task_a = self.db.query(Task).filter_by(slug="taska").first()
        self.assertIsNone(task_a)
        
        task_b = self.db.query(Task).filter_by(slug="taskb").first()
        self.assertIsNotNone(task_b)
        self.assertEqual(task_b.status, "NOT_STARTED")

        task_c = self.db.query(Task).filter_by(slug="taskc").first()
        self.assertIsNotNone(task_c)

        # Merge them back into TaskD
        execute_transaction_script(self.db, "MERGE TaskB, TaskC INTO TaskD")
        
        task_b = self.db.query(Task).filter_by(slug="taskb").first()
        self.assertIsNone(task_b)
        task_c = self.db.query(Task).filter_by(slug="taskc").first()
        self.assertIsNone(task_c)

        task_d = self.db.query(Task).filter_by(slug="taskd").first()
        self.assertIsNotNone(task_d)

    def test_start_and_pause_lifecycle(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Startup")
        execute_transaction_script(self.db, "CREATE TASK TaskA UNDER Startup")
        
        # Verify default is NOT_STARTED
        task_a = self.db.query(Task).filter_by(slug="taska").first()
        self.assertEqual(task_a.status, "NOT_STARTED")

        # Start task
        execute_transaction_script(self.db, "START TaskA")
        task_a = self.db.query(Task).filter_by(slug="taska").first()
        self.assertEqual(task_a.status, "ACTIVE")

        # Pause task
        execute_transaction_script(self.db, "PAUSE TaskA")
        task_a = self.db.query(Task).filter_by(slug="taska").first()
        self.assertEqual(task_a.status, "PAUSED")

        # Restart task
        execute_transaction_script(self.db, "START TaskA")
        task_a = self.db.query(Task).filter_by(slug="taska").first()
        self.assertEqual(task_a.status, "ACTIVE")

if __name__ == "__main__":
    unittest.main()
