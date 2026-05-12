import logging


class _DBHandler(logging.Handler):
    def __init__(self, monitor: str):
        super().__init__()
        self.monitor = monitor

    def emit(self, record: logging.LogRecord):
        try:
            from src.core.database import insert_log
            insert_log(self.monitor, record.levelname, self.format(record))
        except Exception:
            pass


def setup_logger(name: str, monitor: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    handler = _DBHandler(monitor)
    handler.setFormatter(fmt)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
