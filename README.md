# STI Class Fund System

A full-stack web application designed to help students and administrators manage class funds efficiently. Built with React, Node.js, and a cloud-hosted MySQL database. 

## 📌 Project Overview
Managing class funds manually can lead to lost records and confusion. This system solves that by providing a centralized, secure platform where students can view their payment history, and admins can manage their specific sections without seeing data from other classes.

## ✨ Key Features

### For Students
- **Flexible Login:** Log in using either your Student ID or Full Name.
- **Personal Dashboard:** View your total shared contributions and a clear table of your past payments.
- **Section Fund Tracking:** See the total cash on hand specifically for your section.

### For Admins
- **Section-Based Access:** Admins register for a specific section (e.g., BSIT 1A). They only see and manage students within their own section.
- **Financial Overview:** A dashboard showing total collected, total expenses, monthly net, and current cash on hand.
- **Manage Students:** Add new students, or delete them (which safely removes their payment history).
- **Transaction Logs:** Record student payments and log class expenses. Mistakes can be easily deleted.
- **Admin Registration:** New admins can securely register directly from the login page.

## 🛠️ Tech Stack
- **Frontend:** React.js, Vite, standard CSS
- **Backend:** Node.js, Express.js
- **Database:** MySQL (Hosted on Aiven Cloud)
- **Security:** JWT (JSON Web Tokens) for sessions, Bcrypt for password hashing
- **Deployment:** Netlify (Frontend) & Render (Backend)

## 💻 How to Run Locally
1. Clone this repository.
2. Setup your database credentials in the `backend/.env` file.
3. Open two terminals. 
4. **Backend:** `cd backend` -> `npm install` -> `node server.js`
5. **Frontend:** `cd frontend` -> `npm install` -> `npm run dev`
6. Open `http://localhost:5173` in your browser.

---
*Created as a full-stack web development project.*