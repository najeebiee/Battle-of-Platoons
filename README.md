# Battle of Platoons

A leaderboard and administration system for tracking platoon, leader, commander, company, and product center performance.

## Overview

Battle of Platoons is a React-based system built to manage performance data and display competitive rankings. The project has two main applications:

- `admin-app` - the secured admin dashboard for uploading raw data, managing participants, formulas, updates, publishing, finalization, and audit logs.
- `public-view` - the public leaderboard display for viewing ranked performance across product centers, leaders, commanders, and companies.

The system uses Supabase as its backend data source and provides tools for importing spreadsheet data, calculating scores, and presenting results in a clear leaderboard format.

## Features

- Admin login and protected role-based pages.
- Dashboard for monitoring system data.
- Participant management for leaders, commanders, companies, product centers, and related groups.
- Excel upload support for leaderboard source data.
- Manual data entry for performance records.
- Duplicate checking and import mode handling during uploads.
- Scoring formula management.
- Public leaderboard with filters and category tabs.
- Publishing and finalization workflow.
- Audit log support for tracking system actions.

## System Purpose

The system solves the problem of manually collecting, computing, and presenting performance results for a platoon-based competition or sales structure. It helps administrators upload and validate performance data, apply scoring formulas consistently, and publish rankings that users can view through a separate public leaderboard.

## Technologies Used

- React
- Vite
- JavaScript
- Supabase
- Firebase
- Material UI
- Framer Motion
- Lucide React
- XLSX
- ESLint
- HTML and CSS

## Installation

Install dependencies for each application:

```bash
cd admin-app
npm install
```

```bash
cd ../public-view
npm install
```

For the public leaderboard, create a `.env` file inside `public-view` and add the Supabase environment variables:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run the admin app locally:

```bash
cd admin-app
npm run dev
```

Run the public leaderboard locally:

```bash
cd public-view
npm run dev
```

## Usage

1. Open the admin app in the browser using the local Vite URL shown in the terminal.
2. Log in with an authorized account.
3. Use the dashboard and participant pages to manage system records.
4. Upload Excel leaderboard data or add records manually through the upload page.
5. Review duplicate, valid, and invalid rows before saving data.
6. Configure scoring formulas as needed.
7. Publish or finalize results when the data is ready.
8. Open the public leaderboard app to view the latest rankings.

## Screenshots

### Public Leaderboard - Company Rankings

<img width="1919" height="1079" alt="Public leaderboard company rankings page" src="https://github.com/user-attachments/assets/cc9fc22c-4e1e-43c3-8e9f-29572fba0ddc" />

### Admin Dashboard

<img width="1919" height="1079" alt="Admin dashboard leaderboard overview page" src="https://github.com/user-attachments/assets/26b74f3a-5988-4e25-b825-33ecccbda1f0" />

### Participants - Leaders

<img width="1919" height="1079" alt="Admin participants leaders page" src="https://github.com/user-attachments/assets/937942c9-9bc7-454b-bf75-ebef4d589bec" />

### Updates History

<img width="1919" height="1079" alt="Admin updates history page" src="https://github.com/user-attachments/assets/d1e172f4-8f7a-4d6b-9113-90bda96aaa59" />

### Scoring Formulas

<img width="1919" height="1079" alt="Admin scoring formulas page" src="https://github.com/user-attachments/assets/6c5ce1f9-cfb1-4fcf-95d9-5bb7c16639ee" />

### Upload Raw Data

<img width="1919" height="763" alt="Admin upload raw data page" src="https://github.com/user-attachments/assets/dece6844-c6cd-4c98-8e73-85bd0d4cc549" />

### Publishing

<img width="1918" height="960" alt="Admin publishing page" src="https://github.com/user-attachments/assets/e6192425-ab8b-4217-a990-ede0a078f73e" />

### Audit Log

<img width="1919" height="1078" alt="Admin audit log page" src="https://github.com/user-attachments/assets/bcfdc8f0-a7bd-4ad2-8647-5066d347d69b" />

### Week Finalization

<img width="1919" height="1078" alt="Admin week finalization page" src="https://github.com/user-attachments/assets/5a0dea12-c6b8-4b60-b3cb-d40e08d30f23" />


## Author

Najeeb C. Mapantas
