import logging
import os
import signal
import subprocess
import sys
import threading
from typing import Optional

from src.core.paths import DATA_DIR

log = logging.getLogger("process_manager")


class MonitorProcess:
    def __init__(self, name: str, script: str):
        self.name = name
        self.script_path = os.path.join(DATA_DIR, "src", "monitors", script)
        self._process: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()

    def is_running(self) -> bool:
        if self._process and self._process.poll() is None:
            return True
        from src.core.database import get_pid, clear_pid
        pid = get_pid(self.name)
        if pid:
            try:
                os.kill(pid, 0)
                return True
            except OSError:
                clear_pid(self.name)
        return False

    def start(self, env: Optional[dict] = None) -> int:
        with self._lock:
            if self.is_running():
                raise RuntimeError(f"{self.name} already running")
            proc_env = os.environ.copy()
            proc_env["PYTHONPATH"] = DATA_DIR
            if env:
                proc_env.update(env)
            self._process = subprocess.Popen(
                [sys.executable, self.script_path],
                env=proc_env,
                cwd=DATA_DIR,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return self._process.pid

    def stop(self) -> bool:
        stopped = False
        if self._process and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None
            stopped = True

        from src.core.database import get_pid, clear_pid
        pid = get_pid(self.name)
        if pid:
            try:
                os.kill(pid, signal.SIGTERM)
                stopped = True
            except OSError:
                pass
            clear_pid(self.name)

        return stopped
