"""Short-lived in-memory store between /analyze-file and /render-redacted.

Nothing is written to disk; jobs expire after 15 minutes.
"""

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

TTL_S = 15 * 60


@dataclass
class Job:
    kind: str  # image | pdf | pptx
    filename: str
    mime: str
    data: Any  # pipeline-specific state
    created: float = field(default_factory=time.time)


_jobs: dict[str, Job] = {}
_lock = threading.Lock()


def put(job: Job) -> str:
    job_id = uuid.uuid4().hex
    with _lock:
        now = time.time()
        for k in [k for k, j in _jobs.items() if now - j.created > TTL_S]:
            del _jobs[k]
        _jobs[job_id] = job
    return job_id


def get(job_id: str) -> Job | None:
    with _lock:
        return _jobs.get(job_id)
