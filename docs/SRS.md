# Software Requirements Specification

## MessMind — Smart Hostel Mess Attendance Forecasting and Food Waste Reduction System

| | |
| --- | --- |
| **Course** | Software Engineering · B.Tech (CSE / CSB), 2nd Year |
| **Institution** | Indian Institute of Information Technology, Lucknow |
| **Group number** | 24 |
| **Submitted to** | Dr. Sushil Kumar Tiwari |

**Prepared by**

| Name | Roll number |
| --- | --- |
| Aary Garge | LCB2025024 |
| Advait Deshpande | LCI2025046 |
| Pruthviraj Mane | LCI2025038 |
| Ranveer Hajari | LCI2025043 |

> The formatted submission copy is [`Group_24/SRS/MessMind_SRS_Group24.pdf`](../Group_24/SRS/MessMind_SRS_Group24.pdf).

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Specific Requirements](#3-specific-requirements)
4. [External Interface Requirements](#4-external-interface-requirements)
5. [System Models](#5-system-models)
6. [Requirements Traceability Matrix](#6-requirements-traceability-matrix)
7. [Future Enhancements](#7-future-enhancements)
- [Appendix A — Worked Example of a Forecast](#appendix-a--worked-example-of-a-forecast)

---

## 1 Introduction

### 1.1 Purpose

This document specifies the requirements for MessMind, a web-based system that forecasts hostel mess attendance for each meal and converts that forecast into a preparation quantity for the kitchen. It defines what the system must do, the constraints it works under, and how each requirement will be checked.

### 1.2 Scope of the Product

A mess cook has to decide how much to cook several hours before he knows how many students will eat. The decision is a guess, and it gets no feedback: nobody measures how wrong yesterday's guess was, so the same error repeats. Because running short is worse than wasting food, the guess is also biased high.

MessMind targets that one decision. It collects what students intend to do, corrects those intentions using each student's own history, recommends a quantity per dish, and then measures what was actually left over so the next forecast is better.

**Table 1.1 — Scope boundary**

| In scope | Out of scope |
| --- | --- |
| Per-meal intent capture from students | Meal ratings and menu voting |
| Attendance forecasting weighted by student reliability | Mess fees, billing and payments |
| Per-dish preparation quantity recommendation | Complaint and grievance handling |
| Staged (two-batch) cooking guidance during service | Cost and procurement analytics |
| Leftover logging after each meal | Inventory and stock management |
| Automatic recalibration of forecast parameters | Nutrition and dietary tracking |

The exclusions are intentional. Each is a separate problem, and including any of them would dilute the single problem this project addresses.

### 1.3 Definitions and Abbreviations

| Term | Meaning |
| --- | --- |
| **Meal slot** | One of Breakfast, Lunch or Dinner on a given date. The unit of forecasting. |
| **Declaration** | A student's statement that they will or will not eat a meal slot. Treated as evidence, not as a commitment. |
| **Marking window** | The period during which declarations can be made or changed. It ends at the marking cut-off. |
| **Reliability score (r)** | How often a student who declared "eating" actually attended. |
| **Flip rate (f)** | How often a student who declared "not eating" attended anyway. |
| **Baseline rate (b)** | A student's attendance rate on slots where they declared nothing. |
| **Safety buffer (β)** | A configurable upward adjustment to the forecast, because a shortage costs more than a surplus. |
| **Staged cooking** | Cooking a first batch before service, then deciding during service whether to cook the rest. |
| **Leftover level** | A four-point estimate of what remains in a container: Empty, Almost empty, Half left, Mostly full. |
| **Cold start** | The state in which the system has too little history to compute per-student parameters. |
| **RBAC** | Role-Based Access Control. |
| **DFD** | Data Flow Diagram. |

### 1.4 References

- **IEEE Std 830-1998** — IEEE Recommended Practice for Software Requirements Specifications. The structure of this document follows this standard.
- **Course handout and presentation guidelines**, Software Engineering, IIIT Lucknow. Source of the single-problem constraint CON-1.
- **Project repository** — source code, this document and the presentation deck, submitted as the Group 24 folder.

---

## 2 Overall Description

### 2.1 Product Perspective

MessMind is a new, self-contained web application. It does not replace the mess register or mess-card arrangements already in place; it sits alongside them and uses an attendance signal from them where one exists. Where none exists, it relies on student declarations and its own history.

The application has four layers. Keeping the prediction logic in its own layer is a deliberate choice (CON-4), so the optional machine-learning refinement can be added or removed without touching the API or the interface.

![Layered architecture of the system](diagrams/architecture.png)

*Figure 2.1 — Layered architecture of the system*

### 2.2 Product Functions

The system performs six functions, which match the six processes in the level 1 data flow diagrams of Section 5.1:

- **Capture intent.** Store each student's declaration for each upcoming meal slot and remind those who have not declared.
- **Predict attendance.** Combine declarations with per-student reliability parameters and apply a safety buffer.
- **Recommend quantity.** Convert attendance into a quantity per dish and split it into a first batch and a held-back batch.
- **Adjust the staged batch.** Compare live check-ins against the forecast during service and advise whether to cook the held-back batch.
- **Log waste and recalibrate.** Record what was left over, derive what was served, and update reliability scores and consumption rates.
- **Generate analytics.** Show aggregate trends in forecast accuracy and wastage to the mess administration.

### 2.3 User Classes and Characteristics

| User class | Characteristics | Frequency of use |
| --- | --- | --- |
| **Student** | Hostel resident using a personal phone. Motivated by convenience, not by any obligation to the system, so participation has to be optional and quick. | Up to 3 times a day, often none |
| **Mess Staff** | Kitchen supervisor or counter attendant at a shared desktop. May have limited familiarity with web applications and little spare time during service. | Several times per meal |
| **Admin** | Mess manager or warden. Configures slots, menus and parameters, and reviews performance. | Weekly |

The Mess Staff characteristics drive NFR-6 directly. A dashboard that takes more than a couple of clicks will not be used during service, and an unused dashboard produces no feedback data.

### 2.4 Operating Environment

The system is a responsive web application. Students use a mobile browser; mess staff use the counter desktop and admin uses an office desktop. Nothing needs to be installed. The server is a Node.js application exposing a REST API over HTTPS, backed by a PostgreSQL database. The prediction module runs in the application layer, with an optional regression refinement as a separate module. Deployment is on managed free-tier hosting, so no on-premise server is required.

### 2.5 Design and Implementation Constraints

| ID | Constraint |
| --- | --- |
| CON-1 | The system addresses a single core problem. Features belonging to adjacent problems are excluded, even where they would be easy to build. |
| CON-2 | The core estimator is a deterministic arithmetic formula, not an opaque model, so any recommendation can be explained to the kitchen and reproduced by hand. |
| CON-3 | The system must produce a usable recommendation on its first day, with no historical data. |
| CON-4 | Any machine-learning component is a refinement layer above the deterministic estimator. The system stays fully functional with that layer absent. |
| CON-5 | Leftover measurement must not need weighing equipment. A coarse four-point estimate is the finest granularity the kitchen can realistically supply. |
| CON-6 | Development is limited to one week by a team of four, so the deliverable is a working skeleton rather than a production system. |
| CON-7 | Version control is Git, with feature branches and pull requests per module, as required by the laboratory component. |

### 2.6 Assumptions and Dependencies

| ID | Assumption | If it is false |
| --- | --- | --- |
| ASM-1 | Some students will declare intent, but participation will be partial and inconsistent. | No impact. Undeclared students are forecast from their baseline rate. |
| ASM-2 | Mess staff can give a four-point leftover estimate per dish after each meal. | Consumption rates stop updating; attendance forecasting still works but quantity advice degrades. |
| ASM-3 | A check-in signal, manual or card-based, is available during service. | Staged cooking cannot run; the system falls back to a single-batch recommendation. |
| ASM-4 | Attendance follows stable weekly and menu-linked patterns. | Accuracy falls towards the flat baseline, which is still better than an unaided guess. |
| ASM-5 | Students are not penalised for their declarations, and know it. | Declarations become strategic and reliability scores lose meaning. NFR-2 exists to prevent this. |
| DEP-1 | Free-tier hosting and the PostgreSQL service remain available. | Local deployment for the demonstration. |

### 2.7 Feasibility Study

| Dimension | Assessment |
| --- | --- |
| **Technical** | The stack is conventional and within the team's competence. The estimator is weighted arithmetic over a few database aggregates, not a research problem. |
| **Economic** | All infrastructure is available on free tiers. No licensing, hardware or weighing equipment is needed. |
| **Operational** | Students already carry phones and staff already use a counter desktop. The only new habit is a short leftover entry after each meal. Adoption risk is low because the forecast does not depend on student participation. |
| **Legal** | Data held is institutional and low-sensitivity. Individual attendance is never shown to staff or admin, and declarations carry no financial consequence. |
| **Schedule** | Achievable in one week because scope is fixed by CON-1 and the work splits into four independent modules, one per team member. |

### 2.8 Process Model

The team follows an incremental model rather than a waterfall. The reason is that the requirements themselves changed during the first week: staged cooking and leftover logging were only added after the operational assumptions in Section 2.6 were checked, and a model that fixes everything before construction starts would not have allowed that.

Scope, however, was fixed early. Section 1.2 is treated as closed, so iteration applies to how a feature is built, not to which problem is being solved. Work is split into five short increments: schema and authentication; meal marking; the prediction engine; the staff dashboard and quantity recommendation; and waste logging with recalibration. Git is used throughout, with one feature branch per module and a pull request reviewed by another member before merge.
