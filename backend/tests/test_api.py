import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database.connection import Base, get_db
from backend.models.models import Responsibility

# Create in-memory engine with StaticPool for sharing across threads
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

class TestAPI(unittest.TestCase):
    def setUp(self):
        # Create tables on the shared in-memory connection
        Base.metadata.create_all(bind=test_engine)
        self.db = TestSessionLocal()
        
        # Override dependency
        def override_get_db():
            db = TestSessionLocal()
            try:
                yield db
            finally:
                db.close()
        
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        # Clear override
        app.dependency_overrides.clear()
        self.db.close()
        # Drop tables to clear state between tests
        Base.metadata.drop_all(bind=test_engine)

    def test_run_command_success(self):
        response = self.client.post("/api/commands", json={"command": "CREATE RESPONSIBILITY Career"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "SUCCESS")

        response = self.client.post("/api/commands", json={"command": "CREATE PROJECT OpsaDev UNDER Career"})
        self.assertEqual(response.status_code, 200)

    def test_run_command_validation_failure(self):
        # First create Career
        self.client.post("/api/commands", json={"command": "CREATE RESPONSIBILITY Career"})
        # Duplicate name should return 400
        response = self.client.post("/api/commands", json={"command": "CREATE RESPONSIBILITY Career"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("already exists", response.json()["detail"])

    def test_get_state(self):
        self.client.post("/api/commands", json={"command": "CREATE RESPONSIBILITY Career"})
        response = self.client.get("/api/state")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("responsibilities", data)
        slugs = [r["slug"] for r in data["responsibilities"]]
        self.assertIn("career", slugs)

    def test_get_graph_and_timeline(self):
        self.client.post("/api/commands", json={"command": "CREATE RESPONSIBILITY Career"})
        response = self.client.get("/api/graph")
        self.assertEqual(response.status_code, 200)
        self.assertIn("nodes", response.json())
        self.assertIn("edges", response.json())

        response = self.client.get("/api/timeline")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(len(response.json()) > 0)

if __name__ == "__main__":
    unittest.main()
