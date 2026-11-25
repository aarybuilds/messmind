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

To show the live service panel at any time of day, put the next meal in service:

```bash
cd backend && npm run demo:serve          # service started 18 minutes ago
cd backend && npm run demo:serve -- done  # service just ended, log leftovers
```

Backend tests use a separate database:

```bash
createdb messmind_test
cd backend && npm test
```

Demo accounts (password `messmind123`):

| Role | Email |
| --- | --- |
| Admin | admin@iiitl.ac.in |
| Mess staff | staff1@iiitl.ac.in |
| Student | lcb2025101@iiitl.ac.in |

## How the forecast works

For each meal, every student counts towards the forecast whether or not they marked:

```
E   = Σ r (said yes)  +  Σ f (said no)  +  Σ b (didn't say)
E'  = E × (1 + β)          safety buffer, rounded up
Q_d = E' × c_d             quantity per dish
B_d = σ × Q_d              first batch, rest held back
```

`r`, `f` and `b` come from each student's own history once they have 15 meals, and from
meal-type and day-of-week averages before that (SRS table 3.1). After every meal the
profiles are updated from who actually came. With 90+ finished meals a small ridge
regression is shown next to the formula; the kitchen plan always uses the formula.

After each meal, staff log what is left in each container (Empty / Almost empty / Half left /
Mostly full). The served amount per student is worked out from that and each dish's per-student
rate moves 20% of the way towards it, so the next quantity plan is closer.

Code: `backend/src/services/estimator.js`, `parameters.js`, `forecast.js`, `recalibrate.js`, `refiner.js`, `staged.js`, `wasteMath.js`.

## Status

All five increments from SRS section 2.8 are implemented. 105 backend tests.

| Increment | Status |
| --- | --- |
| 1. Schema and authentication | Done |
| 2. Meal marking | Done |
| 3. Prediction engine | Done |
| 4. Staff dashboard and quantity recommendation | Done |
| 5. Waste logging and recalibration | Done |
