import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database.connection import Base
from backend.models.models import Event, Transaction, Task, Goal, Project, Responsibility, Relationship
from backend.commands.engine import execute_transaction_script, ValidationError
from backend.state_builder.state_store import rebuild_projections

class TestNamespacedSlugs(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite database for testing
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.db = Session()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def test_duplicate_names_different_parents(self):
        # 1. Setup parent structure
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceA UNDER Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceB UNDER Dev")

        # 2. Create goals with the SAME NAME under different projects
        res1 = execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceA")
        res2 = execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceB")
        self.assertEqual(res1["status"], "SUCCESS")
        self.assertEqual(res2["status"], "SUCCESS")

        # 3. Verify they exist as separate, parent-namespaced slugs in DB
        goals = self.db.query(Goal).all()
        self.assertEqual(len(goals), 2)
        slugs = {g.slug for g in goals}
        self.assertIn("dev-servicea-frontend", slugs)
        self.assertIn("dev-serviceb-frontend", slugs)

    def test_duplicate_names_same_parent_fails(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceA UNDER Dev")

        # Create first goal
        execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceA")
        
        # Creating a duplicate goal under the same project should fail
        with self.assertRaises(ValidationError):
            execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceA")

    def test_ambiguity_rejection(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceA UNDER Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceB UNDER Dev")
        execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceA")
        execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceB")
        execute_transaction_script(self.db, "CREATE TASK TaskA UNDER Frontend OF ServiceA")
        execute_transaction_script(self.db, "CREATE TASK TaskA UNDER Frontend OF ServiceB")

        # Trying to complete 'TaskA' directly without context should raise ambiguity error
        with self.assertRaises(ValidationError) as ctx:
            execute_transaction_script(self.db, "COMPLETE TaskA")
        self.assertIn("Ambiguous name reference", str(ctx.exception))

        # Trying to complete a Goal directly should raise task-guard error
        with self.assertRaises(ValidationError) as ctx2:
            execute_transaction_script(self.db, "COMPLETE Frontend OF ServiceA")
        self.assertIn("can only be used on Tasks", str(ctx2.exception))

    def test_context_scoped_resolution(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceA UNDER Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceB UNDER Dev")
        execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceA")
        execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceB")
        execute_transaction_script(self.db, "CREATE TASK TaskX UNDER Frontend OF ServiceA")
        execute_transaction_script(self.db, "CREATE TASK TaskY UNDER Frontend OF ServiceB")

        # 1. Complete TaskX (under Frontend OF ServiceA)
        res = execute_transaction_script(self.db, "COMPLETE TaskX")
        self.assertEqual(res["status"], "SUCCESS")

        # Verify ServiceA Frontend rolls up to COMPLETED, ServiceB Frontend stays NOT_STARTED
        from backend.models.models import Goal
        g_a = self.db.query(Goal).filter_by(slug="dev-servicea-frontend").first()
        g_b = self.db.query(Goal).filter_by(slug="dev-serviceb-frontend").first()
        self.assertEqual(g_a.status, "COMPLETED")
        self.assertEqual(g_b.status, "NOT_STARTED")

        # 2. Complete TaskY (under Frontend OF ServiceB)
        res2 = execute_transaction_script(self.db, "COMPLETE TaskY")
        self.assertEqual(res2["status"], "SUCCESS")
        g_b = self.db.query(Goal).filter_by(slug="dev-serviceb-frontend").first()
        self.assertEqual(g_b.status, "COMPLETED")

    def test_block_with_context_scope(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceA UNDER Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceB UNDER Dev")
        execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceA")
        execute_transaction_script(self.db, "CREATE GOAL Backend UNDER ServiceA")
        execute_transaction_script(self.db, "CREATE GOAL Backend UNDER ServiceB")

        # Block Frontend OF ServiceA with Backend OF ServiceA
        res = execute_transaction_script(self.db, "BLOCK Frontend OF ServiceA WITH Backend OF ServiceA")
        self.assertEqual(res["status"], "SUCCESS")

        # Verify blocker relationship in DB
        rel = self.db.query(Relationship).first()
        self.assertEqual(rel.source_slug, "dev-servicea-backend")
        self.assertEqual(rel.target_slug, "dev-servicea-frontend")

    def test_move_with_context_scope(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceA UNDER Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceB UNDER Dev")
        execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceA")

        # Move Frontend OF ServiceA under ServiceB
        res = execute_transaction_script(self.db, "MOVE Frontend OF ServiceA UNDER ServiceB")
        self.assertEqual(res["status"], "SUCCESS")

        # Verify new unique slug and parent reference
        g = self.db.query(Goal).first()
        self.assertEqual(g.slug, "dev-serviceb-frontend")
        
        # Verify it no longer exists under ServiceA
        g_old = self.db.query(Goal).filter_by(slug="dev-servicea-frontend").first()
        self.assertIsNone(g_old)

    def test_merge_with_context_scope(self):
        execute_transaction_script(self.db, "CREATE RESPONSIBILITY Dev")
        execute_transaction_script(self.db, "CREATE PROJECT ServiceA UNDER Dev")
        execute_transaction_script(self.db, "CREATE GOAL Frontend UNDER ServiceA")
        execute_transaction_script(self.db, "CREATE GOAL Backend UNDER ServiceA")

        # Merge Frontend OF ServiceA and Backend OF ServiceA into Fullstack
        res = execute_transaction_script(self.db, "MERGE Frontend OF ServiceA, Backend OF ServiceA INTO Fullstack")
        self.assertEqual(res["status"], "SUCCESS")

        # Verify new merged goal exists under ServiceA
        g = self.db.query(Goal).filter_by(slug="dev-servicea-fullstack").first()
        self.assertIsNotNone(g)
        self.assertEqual(g.name, "Fullstack")

        # Verify old goals are deleted (completely removed from db/projections)
        goals = {g.slug: g.status for g in self.db.query(Goal).all()}
        self.assertNotIn("dev-servicea-frontend", goals)
        self.assertNotIn("dev-servicea-backend", goals)
