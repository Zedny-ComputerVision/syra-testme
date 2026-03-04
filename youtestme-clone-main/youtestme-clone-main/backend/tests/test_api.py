import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
import asyncio
from datetime import datetime, timezone

@pytest.mark.asyncio
async def test_full_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Root check
        response = await ac.get("/")
        assert response.status_code == 200
        
        # 2. Register
        unique_email = f"test_{datetime.now(timezone.utc).timestamp()}@example.com"
        reg_response = await ac.post("/api/auth/register", json={
            "name": "Test User",
            "email": unique_email,
            "password": "password123",
            "role": "candidate"
        })
        assert reg_response.status_code == 201
        user_id = reg_response.json()["user"]["id"]

        # 3. Login
        login_response = await ac.post("/api/auth/login", json={
            "email": unique_email,
            "password": "password123"
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]

        # 4. Get Tests
        tests_response = await ac.get("/api/tests/")
        assert tests_response.status_code == 200
        assert isinstance(tests_response.json(), list)

        # 5. Get Stats
        stats_response = await ac.get("/api/reports/stats")
        assert stats_response.status_code == 200
        assert "users" in stats_response.json()
