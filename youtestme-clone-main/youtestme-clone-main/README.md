# YouTestMe Clone - Full Stack Microservices Application

## 🌟 Overview
This project is a high-fidelity clone of the **YouTestMe** platform, a comprehensive environment for online testing, surveys, and training courses. It features a modern microservices architecture, AI-powered proctoring, and a sophisticated admin dashboard built with React and Material UI.

## 🚀 Key Features
- **Microservices Architecture**: Powered by FastAPI (Python) for independent scalability.
- **AI Proctoring**: Real-time focus detection, emotion tracking, and ID verification.
- **Admin Dashboard**: Comprehensive management of surveys, tests, training courses, and user roles.
- **Reporting System**: Dynamic report builder and predefined performance metrics.
- **Modern UI**: Clean, responsive design using MUI v5 and Lucide icons.

## 🛠 Technology Stack

### Frontend
- **Framework**: React 18 (Vite)
- **Language**: TypeScript
- **UI Library**: Material UI (MUI) v5+
- **Icons**: Lucide-React & Iconify
- **State Management**: React Hooks & Context API

### Backend
- **Framework**: Python 3.10+ (FastAPI)
- **Database**: PostgreSQL (SQLAlchemy Async)
- **ORM**: SQLAlchemy with `asyncpg`

### AI Service
- **Logic**: Python (FastAPI)
- **Computer Vision**: OpenCV, Mediapipe
- **Features**: Focus detection (2s threshold), emotion logging, ID verification.

## 📂 Project Structure
```text
.
├── backend/            # FastAPI Microservices (Auth, Test, Admin)
├── frontend/           # React TypeScript Frontend
├── ai-service/         # AI Proctoring Logic
├── .gitignore          # Git exclusion rules
├── README.md           # Project documentation
└── ...
```

## ⚙️ Setup Instructions

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL

### 2. Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
source venv/bin/activate # Linux/macOS
pip install -r requirements.txt
# Configure .env based on .env.example
python -m app.main
```

### 3. Frontend Setup
```bash
cd frontend
npm install
# Configure .env based on .env.example
npm run dev
```

### 4. AI Service Setup
```bash
cd ai-service
pip install -r requirements.txt
python main.py
```

## 📝 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
Developed with ❤️ by the Antigravity Team.
