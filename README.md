# Online Clipboard - Instant File Transfer

A self-hosted online clipboard application where you can upload files from one device and access them from another device on the same network. Files automatically expire and delete after 2 minutes.

## Features

- 📤 Upload files from any device
- 📥 Download files from any device on the same network  
- ⏱️ Auto-delete files after 2 minutes
- 🔗 Shareable links
- 📋 Copy/paste images directly
- 🎨 Modern UI with Bootstrap 5

## Deploy to Glitch.com (Free Forever!)

### Step 1: Push Code to GitHub
1. Create a new GitHub repository
2. Add these files to it:
   - server.js
   - package.json
   - glitch.json
   - public/index.html
3. Push the code to GitHub

### Step 2: Deploy to Glitch
1. Go to https://glitch.com
2. Click **"Sign In"** → Sign in with GitHub
3. Click **"New Project"** → **"Import from GitHub"**
4. Enter your GitHub repo: `yourusername/your-repo-name`
5. Wait for it to install dependencies
6. Your app is live at: `https://your-project-name.glitch.me`

### Step 3: Use Your Online Clipboard!
- Open the Glitch URL on any device
- Upload files
- Share the link to access from other devices

---

## Run Locally

### 1. Install Dependencies
```
bash
npm install
```

### 2. Start the Server
```
bash
npm start
```

### 3. Access the Application

- **Local:** http://localhost:3000
- **Network:** http://YOUR_IP_ADDRESS:3000

To find your IP address:
- Windows: `ipconfig` (look for IPv4 Address)
- Mac/Linux: `ifconfig` or `ip addr`

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/upload | Upload single file |
| POST | /api/upload-multiple | Upload multiple files |
| GET | /api/files | Get all active files |
| GET | /api/file/:id | Get file info |
| GET | /api/download/:id | Download file |
| GET | /api/preview/:id | Preview file |
| DELETE | /api/file/:id | Delete file |
| DELETE | /api/clear-all | Clear all files |
| GET | /api/status | Server status |

---

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite
- **Frontend:** Bootstrap 5 + Font Awesome
- **File Upload:** Multer

---

## Notes

- Files are stored in the `uploads` folder
- Database is stored in `clipboard.db`
- Maximum file size: 100MB
- Auto-cleanup runs every 30 seconds
