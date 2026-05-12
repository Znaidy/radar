import os

_here = os.path.dirname(os.path.abspath(__file__))
CODE_DIR = os.path.dirname(os.path.dirname(_here))   # backend/
DATA_DIR = os.environ.get('RADAR_DATA_DIR') or CODE_DIR
FRONTEND_DIR = os.path.join(CODE_DIR, 'frontend-dist')
