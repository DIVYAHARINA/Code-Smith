# Code-Smith

Code-Smith is a coding contest web application built with React, TypeScript, Express, and Socket.IO.
It supports real-time rounds, participant management, code execution for multiple languages, and admin controls for running programming events smoothly.

## Features

- Role-based login for:
  - Participant
  - Admin 1
- Real-time contest state updates using Socket.IO
- Multi-round contest flow (Quiz, Debug, Logic/Code tasks)
- Admin dashboard for:
  - Managing questions
  - Starting/ending rounds
  - Monitoring participants
  - Handling violations/locks
- Built-in code execution support for:
  - JavaScript
  - Python
  - C
  - Java
- Persistent local data storage using `data.json`
- Additional standalone `simple-login-system` example with Student/Admin login pages

## Tech Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Node.js + Express + Socket.IO
- Runtime tools: `tsx`, TypeScript compiler

## Project Structure

```text
code-smith/
├── src/                      # React frontend
│   ├── components/
│   ├── lib/
│   ├── types/
│   ├── App.tsx
│   └── main.tsx
├── server.ts                 # Express + Socket.IO backend
├── data.json                 # Local persistent app data
├── simple-login-system/      # Basic HTML/CSS/JS login demo
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (18+ recommended)
- npm

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env.local` file (or set environment variables) and add:

```env
GEMINI_API_KEY=your_key_here
```

### Run in Development

```bash
npm run dev
```

The app runs on:

- `http://localhost:8080`

## Available Scripts

```bash
npm run dev      # Start backend + Vite middleware server
npm run build    # Build production frontend assets
npm run preview  # Preview built frontend
npm run lint     # Type-check using TypeScript
```

## Admin Access

Use the configured Admin 1 credentials from your local data setup to log in and control contest rounds.

## Notes

- Only one server instance should run at a time to avoid port conflicts.
- Contest/user/question state is persisted in `data.json`.
- You can customize rounds, scoring, and qualification rules through admin controls.

## License

This project is open for personal and educational use. Add your preferred license if needed.
