# YouTestMe Clone - Full Project Documentation

## 1. Project Overview
This project is a comprehensive clone of the **YouTestMe** platform, designed to provide a robust environment for online testing, surveys, and training courses. It features a microservices architecture, AI-powered proctoring, and a high-fidelity admin dashboard.

---

## 2. Technology Stack

### Frontend
- **Framework**: React 18 (Vite)
- **Language**: TypeScript
- **UI Library**: Material UI (MUI) v5+
- **Icons**: Lucide-React & Iconify
- **State Management**: React Hooks & Context API
- **Styling**: Vanilla CSS & MUI System

### Backend
- **Framework**: Python 3.10+ (FastAPI)
- **Database**: PostgreSQL (SQLAlchemy Async)
- **Migration**: Migrated from a monolithic TypeScript backend to Python microservices.
- **Components**: Auth Service, Test Service, Admin Service.

### AI Service
- **Logic**: Python (FastAPI)
- **Computer Vision**: OpenCV, Mediapipe
- **Features**: Focus detection, emotion tracking, ID verification.

---

## 3. Key Milestones & Steps Taken

### Phase 1: Infrastructure & Backend Migration
- **Monolith to Microservices**: Transformed the backend from TypeScript to Python/FastAPI for better scalability and performance.
- **Database Setup**: Configured PostgreSQL with `asyncpg` for asynchronous database operations.
- **Docker Removal**: Simplified the development environment by removing Docker and running services natively.
- **Data Seeding**: Created a `seed.py` script to populate the database with initial users, tests, and configurations.

### Phase 2: AI Proctoring & Monitoring
- **ID Verification**: Fixed errors in the ID verification flow to ensure accurate candidate identification.
- **Focus Detection**: Implemented logic to track unfocused periods (sustained for 2+ seconds) across different sensitivity modes (Strict, Normal, Relaxed).
- **Emotion Logging**: Added real-time emotion tracking (Stored in `emotion_log.csv`) during exams.

### Phase 3: Admin Dashboard Replication (Major Work)
The primary focus was replicating the YouTestMe admin interface with high fidelity based on provided designs.

#### Navigation & Sidebar
- **Custom Sidebar**: Implemented a dark-themed, collapsible sidebar with sub-menus for:
  - **Surveys Group**: New Survey, Manage Surveys, Question Pools, Grading Scales.
  - **Training Group**: Training Courses.
  - **Reporting Group**: Report Builder, Predefined Reports, Favorites, Scheduled Reports.

#### Admin Pages Implemented:
1.  **Manage Surveys**: A detailed table view with ID, Name, Status (Published/Draft), and actions (Preview, Schedule).
2.  **Survey Question Pools**: Hierarchical view of question pools with search and import functionality.
3.  **Survey Grading Scales**: Multi-tab interface for managing scales, templates, and grade types (Percentages/Points).
4.  **Training Courses**: Card-based and table-based views for online courses with status tracking.
5.  **Candidates (Test Attempts)**: Advanced filtering system for candidate attempts, including status chips and detailed results.
6.  **New Survey Wizard**: A step-by-step wizard (7 steps) including Information, Settings, Question Selection, Grading, and Review.
7.  **New Test Wizard**: Refactored to include video links, logo uploads, and advanced configuration cards.
8.  **Report Builder**: Dynamic table allowing admins to select tests/surveys and build custom reports.
9.  **Predefined Reports**: A grid of dashboard cards showing metrics for Users, Tests, Certificates, and Questions.
10. **Favorite/Scheduled Reports**: Standardized reporting interfaces with empty states and scheduling logic.

---

## 4. Implementation Details by Service

### Backend (`/backend`)
- **Main Entry**: `app/main.py`.
- **API Endpoints**: 
  - `auth`: Login, Signup, Permissions.
  - `tests`: CRUD operations for exams and templates.
  - `admin`: User and group management.
- **Core Abstractions**: Follows Clean Architecture principles.

### Frontend (`/frontend`)
- **Main Entry**: `src/App.tsx` (Routing).
- **Layouts**: `MainLayout` with `Sidebar` and `Topbar`.
- **Pages Directory**: `src/pages/admin/` contains all implemented admin views.
- **Components**: Reusable MUI-based tables, filters, and stat cards.

### AI Service (`/ai-service`)
- **Proctoring**: Real-time analysis of candidate behavior.
- **Face/Emotion**: Uses deep learning models to log candidate state during tests.

---

## 5. How to Run the Project

### Start Backend
1. Go to `backend` directory.
2. Activate venv: `.\venv\Scripts\activate`
3. Run: `python -m app.main`

### Start Frontend
1. Go to `frontend` directory.
2. Run: `npm run dev`

### Start AI Service
1. Go to `ai-service` directory.
2. Run: `python main.py`

---

## 6. Project Status
- **Current State**: Frontend UI for Admin is 95% complete and matches the reference designs.
- **Next Steps**: Full integration of the "New Survey" wizard with the Python backend and implementing the automated certificate generation logic.

---
**Documented by Antigravity AI**
**Date**: Feb 2026
