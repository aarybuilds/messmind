# MessMind

**Smart Hostel Mess Attendance Forecasting and Food Waste Reduction System**

Group 24 · Software Engineering · IIIT Lucknow · B.Tech 2nd Year
Presentation date: 2 December 2026

## Team

| Member | Roll No |
| --- | --- |
| Aary Garge | LCB2025024 |
| Advait Deshpande | LCI2025046 |
| Pruthviraj Mane | LCI2025038 |
| Ranveer Hajari | LCI2025043 |

## Repository layout

```
messmind/
├── docs/
│   ├── SRS.md          # Software Requirements Specification (IEEE 830)
│   └── diagrams/       # architecture, DFD, use case, class, ER, sequence, activity, state
├── backend/            # REST API + prediction engine
├── frontend/           # web client
├── database/           # schema + seed data
└── Group_24/           # final submission copy for the Drive link
    ├── PPT/            # presentation deck
    └── SRS/            # SRS (PDF + DOCX)
```

## Documents

- [Software Requirements Specification](docs/SRS.md) · [PDF](Group_24/SRS/MessMind_SRS_Group24.pdf)
- [Presentation deck](Group_24/PPT/MessMind_PPT_Group24.pdf)

## Running locally

Needs Node.js 20+ and PostgreSQL 14+.

```bash
# database
createdb messmind

# backend (http://localhost:4000)
cd backend
cp .env.example .env        # set JWT_SECRET to any random string
npm install
npm run db:reset            # creates tables and demo data
npm run dev

# frontend (http://localhost:5173), in a second terminal
cd frontend
npm install
npm run dev
```

Demo accounts (password `messmind123`):

| Role | Email |
| --- | --- |
| Admin | admin@iiitl.ac.in |
| Mess staff | staff1@iiitl.ac.in |
| Student | lcb2025101@iiitl.ac.in |

## Status

Requirements and design are final. Implementation in progress.
