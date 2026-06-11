from backend.database.connection import engine, Base
from backend.models.models import Event, Transaction, Responsibility, Project, Goal, Task, Relationship

def init_db():
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
    print("Database tables initialized successfully.")
