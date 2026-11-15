# Job Application Tracker

**CS 160 – Software Engineering | Team 9**  
San José State University · Fall 2026

## About the Project

Job Application Tracker is a web application designed to help students and job seekers organize and manage their job and internship applications in one place.

Keeping track of applications across different companies can become difficult, especially when each application has a different status or timeline. Our goal is to provide a simple, centralized platform where users can record their applications, monitor progress, and manage their job search more efficiently.

## Features

### Implemented

- **User Authentication:** Sign in with Google or continue as a guest.
- **Session Management:** Maintain authenticated sessions and securely log out.
- **User Profiles:** View profile information and update display names.
- **Application Management:** Add new applications with a company name, job title, application date, and status.
- **Dashboard:** View saved applications and an overview of application counts by status.
- **Status Tracking:** Update application statuses as users move through the hiring process.
- **Edit and Delete:** Modify application details or remove applications.
- **Search and Filtering:** Search applications by company name or job title and filter by application status.
- **Persistent Storage:** Save user and application information in MongoDB.
- **Reminders:** Create reminders related to job applications, including email and Google Calendar options.

### In Development / Planned

- Advanced filtering, including filtering by application date.
- Calendar-based visualization of applications.
- Daily application goals and streak tracking.
- Additional profile customization.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite, CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Authentication | Google Identity Services, Express Sessions |
| Email Reminders | Resend |
| Version Control | Git, GitHub |

## Getting Started

### Prerequisites

- Node.js and npm
- Git
- MongoDB Atlas connection
- Google OAuth Client ID

### 1. Clone the Repository

```bash
git clone <repository-url>
cd job_application_tracker
```

### 2. Configure Environment Variables

The project uses separate environment files for the backend and frontend.

#### Backend

Navigate to the backend directory:

```bash
cd backend
npm install
```

Create a `.env` file by copying the example:

```bash
cp .env.example .env
```

Configure the following variables in `backend/.env`:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth Web Client ID |
| `SESSION_SECRET` | A unique, randomly generated secret for Express sessions |
| `RESEND_API_KEY` | Optional API key for sending email reminders |
| `REMINDER_FROM_EMAIL` | Optional sender email address authorized in Resend |

The email reminder variables are optional if you do not plan to test email reminders.

**Important:** Do not commit your actual `.env` file or share its secrets. The `.env.example` file is provided as a template.

#### Frontend

Open a second terminal and navigate to the frontend directory from the project root:

```bash
cd frontend
npm install
```

Create the frontend environment file:

```bash
cp .env.example .env
```

Configure `frontend/.env`:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

Use the same Google OAuth Client ID configured in `backend/.env` for `GOOGLE_CLIENT_ID`.

For local Google Sign-In development, the Google OAuth client should be configured to allow the frontend origin:

```text
http://localhost:5173
```

### 3. Run the Backend

From the `backend` directory:

```bash
npm run dev
```

The backend runs at:

```text
http://localhost:5001
```

To verify the backend is running, visit:

```text
http://localhost:5001/api/health
```

The backend also supports:

```bash
npm start
```

### 4. Run the Frontend

From the `frontend` directory, in a separate terminal:

```bash
npm run dev
```

Open the application at:

```text
http://localhost:5173
```

Both the frontend and backend must be running for the application to work locally.

### Authentication

Users can access the application through two options:

- **Google Sign-In:** Authenticate using a Google account.
- **Guest Login:** Continue without signing in with Google.

The backend uses Express sessions to maintain authenticated users. Application data is associated with the authenticated user so that users can manage their own applications.

Users can log out through the application navigation.

## Testing

### Backend Tests

From the `backend` directory, run:

```bash
npm test
```

### Frontend Checks

From the `frontend` directory, run:

```bash
npm run lint
npm run build
```

## Test Email Reminders

1. Add `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` to `backend/.env`. For a test to your own inbox, use `onboarding@resend.dev` as the sender and sign in to the tracker with the same email address as your Resend account. To send to other tracker users, use a sender on a domain verified in Resend.
2. Restart the backend. Sign in with Google and open the reminder form for an application.
3. Set **Remind me at** a few minutes ahead and the scheduled time at or after it. Select **Email**, and also select **Google Calendar** if you want to test both channels together. Connect Google Calendar before testing its popup.
4. Save the reminder and keep the backend running. The email worker checks for due reminders about every 15 seconds. Refresh the dashboard to see the email status.

For reminders saved before email delivery was available, edit and save the reminder with **Email** selected to activate it.

## Development Process

This project is developed using an Agile approach as part of CS 160. The team organizes requirements and implementation work through a product backlog, sprint planning, task assignments, and iterative development.

The project began with gathering user feedback to identify useful features for a job application tracker. Based on this feedback, the team prioritized application management, dashboard functionality, and status tracking.

Features are implemented incrementally through collaborative development, code reviews, and integration testing.

## Project Status

The project is actively under development.

Core application management features are implemented, including creating, viewing, editing, deleting, and updating the status of applications. Authentication, guest access, user profiles, and reminder functionality have also been implemented.

The team continues to improve the application and develop additional features to help users organize and manage their job search.

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
