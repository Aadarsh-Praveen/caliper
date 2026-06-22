"""
Wrapper that patches multiprocessing synchronization primitives before importing dbt.

Lambda container images do not mount /dev/shm, so Python's POSIX semaphore-
based locks fail with FileNotFoundError. We replace all synchronize primitives
with threading equivalents, which is safe because dbt only uses them for
intra-process thread safety (not cross-process communication).
"""
import threading
import multiprocessing.synchronize as _sync


class _ThreadRLock:
    def __init__(self, ctx=None):
        self._lock = threading.RLock()

    def acquire(self, block=True, timeout=None):
        if timeout is not None:
            return self._lock.acquire(block, timeout=timeout)
        return self._lock.acquire(block)

    def release(self):
        return self._lock.release()

    def __enter__(self):
        self._lock.acquire()
        return self

    def __exit__(self, *args):
        self._lock.release()


class _ThreadLock:
    def __init__(self, ctx=None):
        self._lock = threading.Lock()

    def acquire(self, block=True, timeout=None):
        if timeout is not None:
            return self._lock.acquire(block, timeout=timeout)
        return self._lock.acquire(block)

    def release(self):
        return self._lock.release()

    def __enter__(self):
        self._lock.acquire()
        return self

    def __exit__(self, *args):
        self._lock.release()


class _ThreadSemaphore:
    def __init__(self, value=1, ctx=None):
        self._sem = threading.Semaphore(value)

    def acquire(self, block=True, timeout=None):
        if timeout is not None:
            return self._sem.acquire(block, timeout=timeout)
        return self._sem.acquire(block)

    def release(self):
        return self._sem.release()

    def __enter__(self):
        self._sem.acquire()
        return self

    def __exit__(self, *args):
        self._sem.release()


class _ThreadBoundedSemaphore(_ThreadSemaphore):
    def __init__(self, value=1, ctx=None):
        self._sem = threading.BoundedSemaphore(value)


_sync.RLock = _ThreadRLock
_sync.Lock = _ThreadLock
_sync.Semaphore = _ThreadSemaphore
_sync.BoundedSemaphore = _ThreadBoundedSemaphore

# Now that all primitives are patched, invoke the dbt CLI normally
from dbt.cli.main import cli  # noqa: E402
cli()
