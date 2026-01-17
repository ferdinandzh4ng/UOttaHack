# UOttaHack - Learning Platform

A React application with Express backend and MongoDB integration for user authentication.

## Getting Started

### Prerequisites

- Node.js installed
- MongoDB running (either locally or connection string)

### Install Dependencies

```bash
npm install
```

### MongoDB Setup

Make sure MongoDB is running. The app will connect to:
- Default: `mongodb://localhost:27017/uottahack`
- Or set `MONGODB_URI` in `.env` file

### Running the Application

You need to run both the frontend and backend servers:

**Terminal 1 - Backend Server:**
```bash
npm run server
```
This starts the Express server on `http://localhost:3001`

**Terminal 2 - Frontend Development Server:**
```bash
npm run dev
```
This starts the Vite dev server (typically `http://localhost:5173`)

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Application Flow

1. **Homepage** - Click "Get Started" button
2. **Role Selection** - Choose between "Educator" or "Student"
3. **Authentication** - Sign up or login with username and password
4. **Dashboard** - View user information after successful authentication

## Project Structure

- `src/` - Frontend React source files
  - `components/` - React components (Homepage, RoleSelection, AuthForm, Dashboard)
  - `main.jsx` - Application entry point
  - `App.jsx` - Main App component with routing
- `server/` - Backend Express server
  - `index.js` - Server entry point
  - `models/User.js` - MongoDB User model
  - `routes/userRoutes.js` - API routes for authentication
- `public/` - Static assets
- `index.html` - HTML template
- `vite.config.js` - Vite configuration with API proxy

## API Endpoints

- `POST /api/users/signup` - Create new user account
- `POST /api/users/login` - Authenticate existing user

## User Data Stored in MongoDB

- `username` - Unique username
- `password` - Hashed password (bcrypt)
- `role` - Either "educator" or "student"
- `createdAt` - Timestamp of account creation

