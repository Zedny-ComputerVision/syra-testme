# YouTestMe - Python Backend

This is the migrated Python backend for the YouTestMe project. It uses FastAPI and PostgreSQL.

## Prerequisites

- Python 3.10+
- PostgreSQL

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment variables:
   Edit the `.env` file with your database credentials.

4. Seed the database (optional but recommended for testing):
   ```bash
   python seed.py
   ```

## Running the Server

```bash
python -m app.main
```
The server will be available at `http://localhost:5000`.

## Testing

```bash
pytest
```
