# STI Class Fund System

A full-stack web application designed to help students and administrators manage class funds efficiently. Built with React, Node.js, and a cloud-hosted MySQL database.

🚀 **Live Demo:** [https://classfund-portal.vercel.app/](https://classfund-portal.vercel.app/) 
*(Note: The backend is hosted on Render's free tier, so the first login might take 30-50 seconds while the server wakes up.)*

📌 **Project Overview**
Managing class funds manually can lead to lost records and confusion. This system solves that by providing a centralized, secure platform where students can view their payment history, submit deposits, and admins can manage their specific sections.

✨ **Key Features**
* **For Students:** Submit deposit requests, view personal contribution history, and see the total class fund.
* **For Admins:** Section-based access (only see your own class), Approve/Reject student deposits, General Ledger (all money in/out), Security Logs (unblock students), and manage students/expenses.
* **For Super Admin:** Global control over all sections, reset admin passwords, and system-wide security controls.

🛠️ **Tech Stack**
* **Frontend:** React.js, Vite, standard CSS (Fully mobile-optimized with stacked card views)
* **Backend:** Node.js, Express.js
* **Database:** MySQL (Hosted on Aiven Cloud)
* **Security:** JWT for sessions, Bcrypt for passwords, Express-Rate-Limit for brute-force protection
* **Deployment:** Vercel (Frontend) & Render (Backend)

💻 **How to Run Locally**
1. Clone this repository.
2. Setup your database credentials in the `backend/.env` file.
3. Open two terminals.
4. **Backend:** `cd backend` -> `npm install` -> `node server.js`
5. **Frontend:** `cd frontend` -> `npm install` -> `npm run dev`
6. Open `http://localhost:5173` in your browser.
