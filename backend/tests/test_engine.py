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
        proj = self.db.query(Project).filter_by(slug="startup-tld").first()
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
        task_b = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taskb").first()
        self.assertEqual(task_b.status, "BLOCKED")

        # Complete TaskA
        execute_transaction_script(self.db, "COMPLETE TaskA")
        # TaskB should now be ACTIVE because TaskA is completed
        task_b = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taskb").first()
        self.assertEqual(task_b.status, "ACTIVE")

        # Defer TaskB until a condition
        execute_transaction_script(self.db, "DEFER TaskB UNTIL TaskA.Completed")
        # Since TaskA is already completed, it shouldn't defer or immediately clear.
        # Let's check state store evaluation
        task_b = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taskb").first()
        self.assertEqual(task_b.status, "ACTIVE")

    def test_split_and_merge(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Startup")
        execute_transaction_script(self.db, "CREATE PROJECT TLD UNDER Startup")
        execute_transaction_script(self.db, "CREATE GOAL LinuxTrack UNDER TLD")
        execute_transaction_script(self.db, "CREATE TASK TaskA UNDER LinuxTrack")

        # Split TaskA into TaskB, TaskC
        execute_transaction_script(self.db, "SPLIT TaskA INTO TaskB, TaskC")
        
        # TaskA should be deleted/removed, TaskB and TaskC should be created under LinuxTrack
        task_a = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taska").first()
        self.assertIsNone(task_a)
        
        task_b = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taskb").first()
        self.assertIsNotNone(task_b)
        self.assertEqual(task_b.status, "NOT_STARTED")

        task_c = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taskc").first()
        self.assertIsNotNone(task_c)

        # Merge them back into TaskD
        execute_transaction_script(self.db, "MERGE TaskB, TaskC INTO TaskD")
        
        task_b = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taskb").first()
        self.assertIsNone(task_b)
        task_c = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taskc").first()
        self.assertIsNone(task_c)

        task_d = self.db.query(Task).filter_by(slug="startup-tld-linuxtrack-taskd").first()
        self.assertIsNotNone(task_d)

    def test_start_and_pause_lifecycle(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Startup")
        execute_transaction_script(self.db, "CREATE TASK TaskA UNDER Startup")
        
        # Verify default is NOT_STARTED
        task_a = self.db.query(Task).filter_by(slug="startup-taska").first()
        self.assertEqual(task_a.status, "NOT_STARTED")

        # Start task
        execute_transaction_script(self.db, "START TaskA")
        task_a = self.db.query(Task).filter_by(slug="startup-taska").first()
        self.assertEqual(task_a.status, "ACTIVE")

        # Pause task
        execute_transaction_script(self.db, "PAUSE TaskA")
        task_a = self.db.query(Task).filter_by(slug="startup-taska").first()
        self.assertEqual(task_a.status, "PAUSED")

        # Restart task
        execute_transaction_script(self.db, "START TaskA")
        task_a = self.db.query(Task).filter_by(slug="startup-taska").first()
        self.assertEqual(task_a.status, "ACTIVE")

    def test_schedule_commands(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY T1")
        execute_transaction_script(self.db, "CREATE PROJECT P1 UNDER T1")
        execute_transaction_script(self.db, "CREATE GOAL G1 UNDER P1")
        execute_transaction_script(self.db, "CREATE TASK TaskA UNDER G1")

        # Schedule Goal
        res = execute_transaction_script(self.db, "SCHEDULE G1 FROM 2026-06-15 09:00:00 TO 2026-06-15 18:00:00")
        self.assertEqual(res["status"], "SUCCESS")
        g1 = self.db.query(Goal).filter_by(slug="t1-p1-g1").first()
        self.assertIsNotNone(g1.scheduled_from)
        self.assertEqual(g1.scheduled_from.strftime("%Y-%m-%d %H:%M:%S"), "2026-06-15 09:00:00")

        # Schedule Task with simple date
        execute_transaction_script(self.db, "SCHEDULE TaskA FROM 2026-06-16 TO 2026-06-17")
        task_a = self.db.query(Task).filter_by(slug="t1-p1-g1-taska").first()
        self.assertEqual(task_a.scheduled_from.strftime("%Y-%m-%d"), "2026-06-16")
        self.assertEqual(task_a.scheduled_to.strftime("%Y-%m-%d"), "2026-06-17")

        # Update schedule with UPDATE command
        execute_transaction_script(self.db, "UPDATE TaskA SET scheduled_from = 2026-06-15")
        task_a = self.db.query(Task).filter_by(slug="t1-p1-g1-taska").first()
        self.assertEqual(task_a.scheduled_from.strftime("%Y-%m-%d"), "2026-06-15")
        self.assertEqual(task_a.scheduled_to.strftime("%Y-%m-%d"), "2026-06-17")

        # Clear schedule
        execute_transaction_script(self.db, "SCHEDULE TaskA FROM null TO null")
        task_a = self.db.query(Task).filter_by(slug="t1-p1-g1-taska").first()
        self.assertIsNone(task_a.scheduled_from)
        self.assertIsNone(task_a.scheduled_to)

        # 15-minute rounding assertion
        execute_transaction_script(self.db, "SCHEDULE TaskA FROM 2026-06-15 09:07:00 TO 2026-06-15 10:23:00")
        task_a = self.db.query(Task).filter_by(slug="t1-p1-g1-taska").first()
        self.assertEqual(task_a.scheduled_from.strftime("%Y-%m-%d %H:%M:%S"), "2026-06-15 09:00:00")
        self.assertEqual(task_a.scheduled_to.strftime("%Y-%m-%d %H:%M:%S"), "2026-06-15 10:30:00")

        # Partial day number syntax (e.g. 15 TO 18)
        execute_transaction_script(self.db, "SCHEDULE TaskA FROM 15 TO 18")
        task_a = self.db.query(Task).filter_by(slug="t1-p1-g1-taska").first()
        self.assertEqual(task_a.scheduled_from.strftime("%H:%M:%S"), "00:00:00")
        self.assertEqual(task_a.scheduled_to.strftime("%H:%M:%S"), "23:45:00")
        self.assertEqual(task_a.scheduled_from.day, 15)
        self.assertEqual(task_a.scheduled_to.day, 18)

        # Duration-based offset syntax (e.g. 2026-06-15 09:00 TO 72 hours)
        execute_transaction_script(self.db, "SCHEDULE TaskA FROM 2026-06-15 09:00 TO 72 hours")
        task_a = self.db.query(Task).filter_by(slug="t1-p1-g1-taska").first()
        self.assertEqual(task_a.scheduled_from.strftime("%Y-%m-%d %H:%M:%S"), "2026-06-15 09:00:00")
        self.assertEqual(task_a.scheduled_to.strftime("%Y-%m-%d %H:%M:%S"), "2026-06-18 09:00:00") # 72 hours later

        # NOW syntax offset (e.g. NOW TO 5 days)
        res_now = execute_transaction_script(self.db, "SCHEDULE TaskA FROM NOW TO 5 days")
        self.assertEqual(res_now["status"], "SUCCESS")
        task_a = self.db.query(Task).filter_by(slug="t1-p1-g1-taska").first()
        self.assertIsNotNone(task_a.scheduled_from)
        self.assertIsNotNone(task_a.scheduled_to)
        # Verify rounded minutes
        self.assertIn(task_a.scheduled_from.minute, [0, 15, 30, 45])
        self.assertIn(task_a.scheduled_to.minute, [0, 15, 30, 45])

        # Invalid target for SCHEDULE (responsibility)
        with self.assertRaises(ValidationError):
            execute_transaction_script(self.db, "SCHEDULE T1 FROM 2026-06-15 TO 2026-06-16")

        # Invalid datetime format
        with self.assertRaises(ValidationError):
            execute_transaction_script(self.db, "SCHEDULE G1 FROM invalid_date TO 2026-06-16")

        # Start datetime after end datetime
        with self.assertRaises(ValidationError):
            execute_transaction_script(self.db, "SCHEDULE G1 FROM 2026-06-17 TO 2026-06-16")

if __name__ == "__main__":
    unittest.main()
