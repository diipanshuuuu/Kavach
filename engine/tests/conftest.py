import sys
from pathlib import Path

# Let tests import engine modules (schemas, detect, docs) directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
