"""
CI check: fail if any FastAPI route handler is `async def` but contains no
`await`, `async for`, or `async with` expressions.  Such handlers run on the
event loop and block all other requests while they execute synchronous DB or IO
work.  Route helpers (non-route callables) are intentionally excluded.

Exit codes:
  0  — no violations found
  1  — one or more violations found (list printed to stdout)
"""

import ast
import sys
from pathlib import Path


ROUTE_DECORATORS = {
    "get", "post", "put", "patch", "delete", "head", "options",
    "websocket", "api_route",
}


def _has_async_node(tree: ast.AST) -> bool:
    """Return True if the AST subtree contains any awaitable expression."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.Await, ast.AsyncFor, ast.AsyncWith)):
            return True
    return False


def _decorator_names(func: ast.AsyncFunctionDef) -> list[str]:
    names = []
    for dec in func.decorator_list:
        if isinstance(dec, ast.Attribute):
            names.append(dec.attr)
        elif isinstance(dec, ast.Call):
            inner = dec.func
            if isinstance(inner, ast.Attribute):
                names.append(inner.attr)
            elif isinstance(inner, ast.Name):
                names.append(inner.id)
        elif isinstance(dec, ast.Name):
            names.append(dec.id)
    return names


def check_file(path: Path) -> list[str]:
    violations = []
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        return [f"{path}: SyntaxError — {exc}"]

    for node in ast.walk(tree):
        if not isinstance(node, ast.AsyncFunctionDef):
            continue
        dec_names = _decorator_names(node)
        if not any(d in ROUTE_DECORATORS for d in dec_names):
            continue
        if not _has_async_node(node):
            violations.append(
                f"{path}:{node.lineno}: async def {node.name}() has no await — "
                "change to `def` so FastAPI runs it in the thread pool"
            )
    return violations


def main(root: str) -> int:
    search_path = Path(root)
    if not search_path.exists():
        print(f"ERROR: path not found: {root}", file=sys.stderr)
        return 1

    all_violations: list[str] = []
    for py_file in sorted(search_path.rglob("*.py")):
        all_violations.extend(check_file(py_file))

    if all_violations:
        print("FAIL — blocking async route handlers found:")
        for v in all_violations:
            print(" ", v)
        print()
        print(
            "Fix: change `async def` to `def` for these route handlers. "
            "FastAPI will run them in anyio's thread pool automatically."
        )
        return 1

    print(f"OK — no blocking async route handlers found in {root}")
    return 0


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "backend/src/app"
    sys.exit(main(target))
