__all__ = ["admin_router", "public_router"]


def __getattr__(name):
    if name == "admin_router":
        from .routes_admin import router as admin_router

        return admin_router
    if name == "public_router":
        from .routes_public import router as public_router

        return public_router
    raise AttributeError(name)
