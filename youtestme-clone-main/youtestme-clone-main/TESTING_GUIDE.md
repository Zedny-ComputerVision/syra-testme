# 🧪 Complete Testing Guide - Full Exam Platform

## 📋 Prerequisites Check

Before starting, ensure you have:
- ✅ Node.js (v16+) - Check with `node --version`
- ✅ Python (v3.8+) - Check with `python3 --version`
- ✅ Docker Desktop (running) - Check with `docker --version`
- ✅ Chrome/Safari browser

---

## 🚀 Step-by-Step Testing Instructions

### Step 1: Start Docker Containers (Databases)

```bash
# Navigate to project root
cd "/Users/mohamedsamirhassan/Desktop/Samir AI/youtestme clone"

# Start PostgreSQL and MongoDB
docker compose up -d

# Verify containers are running
docker ps
```

**Expected Output**: You should see `postgres` and `mongo` containers running.

---

### Step 2: Setup & Start Backend

**Open Terminal 1:**

```bash
# Navigate to backend
cd "/Users/mohamedsamirhassan/Desktop/Samir AI/youtestme clone/backend"

# Install dependencies (first time only)
npm install

# Install additional dependencies (first time only)
npm install express cors dotenv pg mongoose jsonwebtoken bcryptjs zod
npm install -D typescript @types/node @types/express @types/cors @types/bcryptjs @types/jsonwebtoken ts-node nodemon

# Create .env file (first time only)
cat > .env << 'EOL'
PORT=5000
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=exam_platform
POSTGRES_PORT=5432
MONGO_URI=mongodb://localhost:27017/exam_platform
JWT_SECRET=your-super-secret-jwt-key-change-in-production
EOL

# Build TypeScript (first time only)
npm run build

# Seed the database with sample data (first time only)
npm run seed

# Start the backend server
npm run dev
```

**Expected Output**:
```
✅ MongoDB Connected
✅ PostgreSQL Connected
✅ Tables created successfully
🚀 Server running on port 5000
```

**Keep this terminal open!** The backend must stay running.

---

### Step 3: Setup & Start AI Service

**Open Terminal 2 (NEW terminal):**

```bash
# Navigate to AI service
cd "/Users/mohamedsamirhassan/Desktop/Samir AI/youtestme clone/ai-service"

# Make start script executable (first time only)
chmod +x start.sh

# Start the AI service
./start.sh
```

**Expected Output**:
```
🚀 Starting AI Proctoring Service...
📦 Creating virtual environment...
📥 Installing dependencies...
✅ Starting FastAPI server on port 8000...
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Keep this terminal open!** The AI service must stay running.

---

### Step 4: Setup & Start Frontend

**Open Terminal 3 (NEW terminal):**

```bash
# Navigate to frontend
cd "/Users/mohamedsamirhassan/Desktop/Samir AI/youtestme clone/frontend"

# Install dependencies (first time only)
npm install

# Start the development server
npm run dev
```

**Expected Output**:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Keep this terminal open!** The frontend must stay running.

---

## 🧪 Testing Checklist

### ✅ Test 1: Dashboard (2 min)

1. Open browser: **http://localhost:5173**
2. You should see the **Dashboard** with:
   - Welcome banner with gradient background
   - 4 stat cards (Available Tests, Pending Attempts, Average Score, Certificates)
   - 3 quick action buttons
   - Recent tests list

**✓ Pass if**: Dashboard loads with smooth animations

---

### ✅ Test 2: My Tests Page (2 min)

1. Click **"My Tests"** in sidebar
2. You should see:
   - 3 test cards with images
   - Search bar at top
   - Filter and sort buttons
   - Hover effects on cards (lift up on hover)

**✓ Pass if**: Cards animate on hover, status badges show correctly

---

### ✅ Test 3: Equipment Check (3 min)

1. Click **"Equipment Check"** in sidebar
2. Click **"Run All Checks"** button
3. Allow camera/microphone access when prompted
4. Verify:
   - ✅ Camera preview shows your face
   - ✅ Microphone shows animated green bars
   - ✅ Network shows "Good"
   - ✅ Browser shows "Success" with checkmarks

**✓ Pass if**: All 4 checks turn green with checkmarks

---

### ✅ Test 4: Start Exam (5 min)

1. Go back to **"My Tests"**
2. Click **"Start Test"** on **"Senior Frontend Developer Assessment"**
   - Note: Only this test has questions
3. You should be redirected to exam window
4. Verify:
   - ✅ Camera feed shows in right sidebar
   - ✅ "Proctoring Active" status with green dot
   - ✅ Timer is running (60:00 counting down)
   - ✅ "Question 1 of 5" displayed
   - ✅ 4 multiple choice options
   - ✅ Navigation arrows (Next/Previous)

**✓ Pass if**: Exam window loads with live camera feed

---

### ✅ Test 5: AI Proctoring (3 min)

**While in the exam, test AI detection:**

1. **Face Detection Test**:
   - Cover your camera with your hand
   - Wait 3-5 seconds
   - Alert should appear: "No face detected"
   - Uncover camera - alert should clear

2. **Gaze Tracking Test**:
   - Look far to the left or right
   - Wait 3-5 seconds
   - Alert should appear: "Looking away from screen"
   - Look back at screen - alert should clear

3. **Multiple Faces Test**:
   - Have someone else appear in camera frame
   - Wait 3-5 seconds
   - Alert should appear: "Multiple faces detected"

**✓ Pass if**: Alerts appear in real-time in the sidebar (checks every 3 seconds)

---

### ✅ Test 6: Answer Questions (2 min)

1. Select an answer for question 1 (click any option)
2. Click **Next** arrow (right arrow)
3. Answer all 5 questions:
   - Question 1: Which is NOT a valid React Hook?
   - Question 2: Purpose of "key" prop
   - Question 3: CSS flex container
   - Question 4: TypeScript advantage
   - Question 5: Hook for side effects
4. Navigate back and forth between questions
5. Verify your answers are saved (selected option stays highlighted)

**✓ Pass if**: Navigation works smoothly, answers persist when going back

---

### ✅ Test 7: Submit Exam (2 min)

1. Click **"Finish Test"** button (top right)
2. Confirm submission in the alert
3. You should see:
   - Alert showing your score (e.g., "30/50")
   - Automatic redirect to dashboard

**Expected Score**: 
- Each question is worth 10 points
- Total possible: 50 points
- Score is calculated server-side (secure)

**Correct Answers**:
- Q1: useComponent (option 3)
- Q2: To uniquely identify elements (option 2)
- Q3: display: flex (option 2)
- Q4: Static type checking (option 2)
- Q5: useEffect (option 2)

**✓ Pass if**: Score is displayed correctly and you're redirected to dashboard

---

### ✅ Test 8: Sessions Page (1 min)

1. Click **"Sessions"** in sidebar
2. Verify session table displays
3. Check "Book Seat" buttons are visible

**✓ Pass if**: Sessions table shows data

---

## 🔄 Quick Restart Guide (For Next Time)

If you've already set everything up, just run these 3 commands in separate terminals:

**Terminal 1 - Backend:**
```bash
cd "/Users/mohamedsamirhassan/Desktop/Samir AI/youtestme clone/backend"
npm run dev
```

**Terminal 2 - AI Service:**
```bash
cd "/Users/mohamedsamirhassan/Desktop/Samir AI/youtestme clone/ai-service"
./start.sh
```

**Terminal 3 - Frontend:**
```bash
cd "/Users/mohamedsamirhassan/Desktop/Samir AI/youtestme clone/frontend"
npm run dev
```

**Note**: Docker containers should already be running. If not, run `docker compose up -d` first.

---

## 🐛 Troubleshooting

### Backend won't start

**Error: "Cannot find module 'express'"**
```bash
cd backend
npm install express cors dotenv pg mongoose jsonwebtoken bcryptjs zod
npm install -D typescript @types/node @types/express ts-node nodemon
```

**Error: "password authentication failed"**
```bash
# Restart Docker containers
docker compose down -v
docker compose up -d
# Wait 5 seconds, then seed again
cd backend
npm run seed
```

**Error: Port 5000 already in use**
```bash
# Find and kill the process
lsof -i :5000
kill -9 <PID>
```

---

### AI Service won't start

**Error: Port 8000 already in use**
```bash
lsof -i :8000
kill -9 <PID>
```

**Error: Python dependencies missing**
```bash
cd ai-service
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

---

### Frontend won't start

**Error: Dependencies missing**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Error: Port 5173 already in use**
```bash
lsof -i :5173
kill -9 <PID>
```

---

### Database connection errors

```bash
# Check if Docker containers are running
docker ps

# If not running, start them
docker compose up -d

# If still issues, restart everything
docker compose down -v
docker compose up -d
# Wait 10 seconds
cd backend
npm run seed
npm run dev
```

---

### Camera not working

- Check browser permissions: Chrome > Settings > Privacy > Camera
- Try different browser (Chrome recommended)
- Ensure no other app is using camera (Zoom, Teams, etc.)
- Restart browser

---

### AI Proctoring not detecting

- Ensure AI service is running (check Terminal 2)
- Check browser console for errors (F12)
- Verify camera feed is showing in exam window
- Wait 3-5 seconds for detection (checks every 3 seconds)

---

## 📊 Expected Test Results

| Test | Expected Result | Time |
|------|----------------|------|
| Dashboard Load | Animated stats & cards | 2 min |
| My Tests | 3 cards with hover effects | 2 min |
| Equipment Check | All 4 checks green | 3 min |
| Start Exam | Camera feed + questions | 5 min |
| AI Proctoring | Real-time alerts | 3 min |
| Answer Questions | Navigation works | 2 min |
| Submit Exam | Score displayed | 2 min |
| Sessions | Table displays | 1 min |
| **TOTAL** | **All features working** | **~20 min** |

---

## 🎯 Success Criteria

Your test is **SUCCESSFUL** if:
- ✅ All 3 services start without errors
- ✅ Dashboard loads with animations
- ✅ Camera/mic work in equipment check
- ✅ Exam starts and shows live proctoring
- ✅ AI alerts appear when you look away
- ✅ Questions can be answered and submitted
- ✅ Score is calculated correctly (server-side)

---

## � Test Credentials

**Login (if needed):**
- Email: `john@example.com`
- Password: `password123`

**Available Tests:**
- ✅ Senior Frontend Developer Assessment (5 questions, 50 points)
- ⏳ Backend Architecture & System Design (no questions yet)
- ⏳ DevOps & CI/CD Pipelines (no questions yet)

---

## 🆘 Need Help?

If something doesn't work:

1. **Check all terminals are running**:
   - Terminal 1: Backend (port 5000)
   - Terminal 2: AI Service (port 8000)
   - Terminal 3: Frontend (port 5173)

2. **Check Docker containers**:
   ```bash
   docker ps
   # Should show postgres and mongo running
   ```

3. **Check browser console**:
   - Press F12
   - Look for errors in Console tab

4. **Verify ports**:
   ```bash
   lsof -i :5000  # Backend
   lsof -i :8000  # AI Service
   lsof -i :5173  # Frontend
   lsof -i :5432  # PostgreSQL
   lsof -i :27017 # MongoDB
   ```

5. **Restart everything**:
   ```bash
   # Stop all terminals (Ctrl+C)
   docker compose down
   docker compose up -d
   # Then start backend, AI service, and frontend again
   ```

---

## 🎉 After Testing

If everything works:
- ✅ Project is production-ready
- ✅ All features functional
- ✅ AI proctoring operational
- ✅ Ready for deployment

**Next Steps**: 
- Deploy to staging server
- Add more test questions
- Enhance AI detection (YOLO for phone detection)
- Add user authentication flow
- Implement MongoDB proctoring event logging

---

## 💡 Tips

- **First Time Setup**: Takes ~10 minutes (installing dependencies)
- **Subsequent Runs**: Takes ~30 seconds (just start services)
- **Keep terminals open**: All 3 services must run simultaneously
- **Camera permissions**: Browser will ask once, then remember
- **Docker Desktop**: Must be running before starting containers
- **Network**: All services run locally, no internet required (except Docker image pull)

---

## 🔒 Security Notes

- ✅ No external APIs used (100% self-hosted)
- ✅ Correct answers never sent to frontend
- ✅ Server-side scoring prevents cheating
- ✅ JWT authentication for API security
- ✅ Password hashing with bcrypt
- ✅ CORS configured for local development

---

**Happy Testing! 🚀**
