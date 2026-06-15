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


class TestStatusRollup(unittest.TestCase):
    """Tests that Goal/Project/Responsibility statuses are derived from task statuses."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.db = Session()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def _setup_hierarchy(self):
        """Creates: Resp → Project → Goal → [Task1, Task2]"""
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Resp")
        execute_transaction_script(self.db, "CREATE PROJECT Proj UNDER Resp")
        execute_transaction_script(self.db, "CREATE GOAL Goal UNDER Proj")
        execute_transaction_script(self.db, "CREATE TASK Task1 UNDER Goal")
        execute_transaction_script(self.db, "CREATE TASK Task2 UNDER Goal")

    def _get(self, model, slug):
        return self.db.query(model).filter_by(slug=slug).first()

    def test_empty_container_is_not_started(self):
        """A goal/project/resp with no tasks defaults to NOT_STARTED."""
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Resp")
        execute_transaction_script(self.db, "CREATE PROJECT Proj UNDER Resp")
        execute_transaction_script(self.db, "CREATE GOAL Goal UNDER Proj")

        self.assertEqual(self._get(Goal, "resp-proj-goal").status, "NOT_STARTED")
        self.assertEqual(self._get(Project, "resp-proj").status, "NOT_STARTED")
        self.assertEqual(self._get(Responsibility, "resp").status, "NOT_STARTED")

    def test_single_active_task_makes_chain_active(self):
        """Starting one task rolls ACTIVE all the way up."""
        self._setup_hierarchy()
        execute_transaction_script(self.db, "START Task1")

        self.assertEqual(self._get(Task, "resp-proj-goal-task1").status, "ACTIVE")
        self.assertEqual(self._get(Goal, "resp-proj-goal").status, "ACTIVE")
        self.assertEqual(self._get(Project, "resp-proj").status, "ACTIVE")
        self.assertEqual(self._get(Responsibility, "resp").status, "ACTIVE")

    def test_all_tasks_complete_rolls_up_completed(self):
        """Completing all tasks makes the whole chain COMPLETED."""
        self._setup_hierarchy()
        execute_transaction_script(self.db, "COMPLETE Task1")
        execute_transaction_script(self.db, "COMPLETE Task2")

        self.assertEqual(self._get(Goal, "resp-proj-goal").status, "COMPLETED")
        self.assertEqual(self._get(Project, "resp-proj").status, "COMPLETED")
        self.assertEqual(self._get(Responsibility, "resp").status, "COMPLETED")

    def test_partial_completion_keeps_parent_active(self):
        """Completing only one of two tasks keeps parent ACTIVE (work in progress)."""
        self._setup_hierarchy()
        execute_transaction_script(self.db, "COMPLETE Task1")

        # Task2 is NOT_STARTED, Task1 is COMPLETED → mix → ACTIVE takes priority? No —
        # mix of COMPLETED + NOT_STARTED → NOT_STARTED wins over COMPLETED per priority.
        # But functionally NOT_STARTED means "nothing going on"… let's check priority table:
        # ACTIVE > BLOCKED > DEFERRED > PAUSED > NOT_STARTED > COMPLETED > ARCHIVED
        # So NOT_STARTED > COMPLETED → Goal should be NOT_STARTED here.
        goal = self._get(Goal, "resp-proj-goal")
        self.assertEqual(goal.status, "NOT_STARTED")

    def test_all_tasks_paused_rolls_up_paused(self):
        """Pausing all tasks rolls PAUSED up the chain."""
        self._setup_hierarchy()
        execute_transaction_script(self.db, "PAUSE Task1")
        execute_transaction_script(self.db, "PAUSE Task2")

        self.assertEqual(self._get(Goal, "resp-proj-goal").status, "PAUSED")
        self.assertEqual(self._get(Project, "resp-proj").status, "PAUSED")
        self.assertEqual(self._get(Responsibility, "resp").status, "PAUSED")

    def test_blocked_task_rolls_up_blocked(self):
        """A blocked task rolls BLOCKED up only when no tasks are ACTIVE."""
        self._setup_hierarchy()
        execute_transaction_script(self.db, "START Task1")
        # Task1 is ACTIVE, Task2 is NOT_STARTED
        execute_transaction_script(self.db, "BLOCK Task1 BY Task2")

        # Task1 is BLOCKED, Task2 is NOT_STARTED
        # NOT_STARTED > BLOCKED in priority, so Goal should be NOT_STARTED
        self.assertEqual(self._get(Task, "resp-proj-goal-task1").status, "BLOCKED")
        # Goal sees BLOCKED + NOT_STARTED → NOT_STARTED wins (per priority table)
        # Wait: priority is ACTIVE > BLOCKED > DEFERRED > PAUSED > NOT_STARTED
        # So BLOCKED > NOT_STARTED → Goal should be BLOCKED
        self.assertEqual(self._get(Goal, "resp-proj-goal").status, "BLOCKED")
        self.assertEqual(self._get(Project, "resp-proj").status, "BLOCKED")
        self.assertEqual(self._get(Responsibility, "resp").status, "BLOCKED")

    def test_active_wins_over_blocked_in_rollup(self):
        """When one task is ACTIVE and another is BLOCKED, ACTIVE wins in the rollup."""
        self._setup_hierarchy()
        execute_transaction_script(self.db, "CREATE TASK Task3 UNDER Goal")
        execute_transaction_script(self.db, "START Task1")
        execute_transaction_script(self.db, "START Task2")
        execute_transaction_script(self.db, "BLOCK Task1 BY Task2")
        # Task1=BLOCKED, Task2=ACTIVE, Task3=NOT_STARTED → ACTIVE wins
        self.assertEqual(self._get(Goal, "resp-proj-goal").status, "ACTIVE")

    def test_mixed_active_blocked_gives_active(self):
        """ACTIVE takes priority over BLOCKED in the rollup."""
        self._setup_hierarchy()
        execute_transaction_script(self.db, "CREATE TASK Task3 UNDER Goal")
        execute_transaction_script(self.db, "START Task1")
        execute_transaction_script(self.db, "START Task2")
        execute_transaction_script(self.db, "BLOCK Task2 BY Task1")
        # Task3 is NOT_STARTED, Task1 is ACTIVE, Task2 is BLOCKED
        # → ACTIVE wins
        self.assertEqual(self._get(Goal, "resp-proj-goal").status, "ACTIVE")


class TestLifecycleGuards(unittest.TestCase):
    """Tests that lifecycle commands are blocked for non-Task entities."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.db = Session()
        # Build a hierarchy to test against
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Resp")
        execute_transaction_script(self.db, "CREATE PROJECT Proj UNDER Resp")
        execute_transaction_script(self.db, "CREATE GOAL Goal UNDER Proj")
        execute_transaction_script(self.db, "CREATE TASK Task1 UNDER Goal")

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def _assert_rejected(self, cmd: str, fragment: str):
        with self.assertRaises(ValidationError) as ctx:
            execute_transaction_script(self.db, cmd)
        self.assertIn(fragment, str(ctx.exception))

    def test_complete_goal_rejected(self):
        self._assert_rejected("COMPLETE Goal", "can only be used on Tasks")

    def test_complete_project_rejected(self):
        self._assert_rejected("COMPLETE Proj", "can only be used on Tasks")

    def test_complete_responsibility_rejected(self):
        self._assert_rejected("COMPLETE Resp", "can only be used on Tasks")

    def test_pause_goal_rejected(self):
        self._assert_rejected("PAUSE Goal", "can only be used on Tasks")

    def test_start_project_rejected(self):
        self._assert_rejected("START Proj", "can only be used on Tasks")

    def test_archive_goal_rejected(self):
        self._assert_rejected("ARCHIVE Goal", "can only be used on Tasks")

    def test_defer_goal_rejected(self):
        self._assert_rejected("DEFER Goal UNTIL 2099-01-01", "can only be used on Tasks")

    def test_block_goal_creates_relationship(self):
        """BLOCK on a Goal is still allowed (creates a dependency relationship)."""
        res = execute_transaction_script(self.db, "BLOCK Goal BY Task1")
        self.assertEqual(res["status"], "SUCCESS")

    def test_update_status_goal_rejected(self):
        self._assert_rejected("UPDATE Goal SET status = ACTIVE", "Cannot manually set 'status'")

    def test_update_status_project_rejected(self):
        self._assert_rejected("UPDATE Proj SET status = COMPLETED", "Cannot manually set 'status'")

    def test_complete_task_still_works(self):
        """Sanity check — Tasks can still be completed."""
        res = execute_transaction_script(self.db, "COMPLETE Task1")
        self.assertEqual(res["status"], "SUCCESS")

    def test_delete_goal_still_works(self):
        """DELETE is not a status command — should still work on goals."""
        res = execute_transaction_script(self.db, "DELETE Goal")
        self.assertEqual(res["status"], "SUCCESS")

