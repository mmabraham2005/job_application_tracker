# Job Application Tracker

**CS 160 – Software Engineering | Team 9**  
San José State University · Fall 2026

## About the Project

Job Application Tracker is a web application designed to help students and job seekers organize and manage their job and internship applications in one place.

Keeping track of applications across different companies can become difficult, especially when each application has a different status or timeline. Our goal is to provide a simple, centralized platform where users can record their applications, monitor progress, and manage their job search more efficiently.

## Features

### Implemented

- **Application Management:** Add new applications with a company name, job title, application date, and status.
- **Dashboard:** View saved applications and an overview of application counts by status.
- **Status Tracking:** Update application statuses as users move through the hiring process.
- **Edit and Delete:** Modify application details or remove applications.
- **Search and Filtering:** Search applications by company name or job title and filter by application status.
- **Persistent Storage:** Save application information in MongoDB.

### In Development

- **User Authentication:** Google Sign-In and Guest Login.
- **User Profiles:** Individual profile settings and user-specific application data.
- **Advanced Filtering:** Filtering by application date.
- **Calendar:** Calendar-based visualization of applications.
- **Reminders:** Reminders related to job applications.

Additional features, including daily application goals, streak tracking, and profile customization, are planned for future development.

## Technology Stack

| Layer                           | Technologies                               |
| ------------------------------- | ------------------------------------------ |
| Frontend                        | React, JavaScript, Vite, CSS               |
| Backend                         | Node.js, Express.js                        |
| Database                        | MongoDB Atlas, Mongoose                    |
| Authentication (In Development) | Google Identity Services, Express Sessions |
| Version Control                 | Git, GitHub                                |

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB Atlas connection
- Git

### 1. Clone the Repository

```bash
git clone <repository-url>
cd job_application_tracker
```

### 2. Run the Backend

```bash
cd backend
npm install
```

Create a `.env` file using the provided `.env.example` template and configure the required environment variables.

```bash
npm run dev
```

The backend runs at `http://localhost:5001`.

To verify the backend is running, visit:

`http://localhost:5001/api/health`

### 3. Run the Frontend

Open another terminal from the project root.

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

Both the frontend and backend must be running for the application to work locally.

**Note:** Some features, including authentication, are still under development. The current application management features can be tested without logging in.

## Development Process

This project is developed using an Agile approach as part of CS 160. The team organizes requirements and implementation work through a product backlog, sprint planning, task assignments, and iterative development.

The project began with gathering user feedback to identify useful features for a job application tracker. Based on this feedback, the team prioritized application management, dashboard functionality, and status tracking.

Features are implemented incrementally through collaborative development, code reviews, and integration testing.

## Project Status

The project is actively under development.

Core application management features are implemented, including creating, viewing, editing, deleting, and updating the status of applications. Basic dashboard and filtering functionality are also available.

The team is continuing development of authentication, user-specific functionality, and additional application management features.

## Team

**Team 9 — CS 160 Software Engineering**

- Ben Nguyen
- Maya Abraham
- Thel Nu Zaw
- Nghi Nguyen

## Course Information

**Course:** CS 160 – Software Engineering  
**Institution:** San José State University  
**Semester:** Fall 2026

This project was developed as part of the CS 160 Software Engineering course.
