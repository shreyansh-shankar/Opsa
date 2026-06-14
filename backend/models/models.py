import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey
from backend.database.connection import Base

class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    transaction_id = Column(String, index=True, nullable=True)
    operation = Column(String, nullable=False)
    target = Column(String, index=True, nullable=False)
    payload = Column(JSON, nullable=False)
    status = Column(String, default="SUCCESS")  # SUCCESS | FAILED

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status = Column(String, default="COMMITTED")  # COMMITTED | ROLLED_BACK

class Responsibility(Base):
    __tablename__ = "responsibilities"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, default="NOT_STARTED")  # NOT_STARTED | ACTIVE | COMPLETED | ARCHIVED | DELETED | PAUSED
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    responsibility_id = Column(String, ForeignKey("responsibilities.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, default="NOT_STARTED")  # NOT_STARTED | ACTIVE | COMPLETED | ARCHIVED | DELETED | PAUSED
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Goal(Base):
    __tablename__ = "goals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, default="NOT_STARTED")  # NOT_STARTED | ACTIVE | COMPLETED | ARCHIVED | DELETED | PAUSED
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    goal_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    responsibility_id = Column(String, ForeignKey("responsibilities.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, default="NOT_STARTED")  # NOT_STARTED | ACTIVE | COMPLETED | DEFERRED | BLOCKED | ARCHIVED | DELETED | PAUSED
    deferred_until = Column(DateTime, nullable=True)
    deferred_condition = Column(String, nullable=True)
    priority = Column(String, default="MEDIUM")  # LOW | MEDIUM | HIGH | URGENT
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Relationship(Base):
    __tablename__ = "relationships"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_slug = Column(String, index=True, nullable=False)
    target_slug = Column(String, index=True, nullable=False)
    type = Column(String, nullable=False)  # depends_on | blocks | linked_to | related_to
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
