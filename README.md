# Hospital Management System (HMS)

Web-based HMS with appointment booking and role-based dashboards (Admin / Doctor).

## Technology
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: MySQL
- Database driver: mysql2

## Structure
```
hms/
├── backend/    Node.js + Express REST API
├── frontend/   HTML + CSS + JavaScript pages
└── database.sql MySQL schema and demo seed data
```

## MySQL setup
1. Start MySQL (XAMPP/WAMP/MySQL Server).
2. Open MySQL Workbench or the MySQL command line.
3. Run `database.sql` to create `hms_db` and the required tables/data.
4. If your MySQL root account has a password, set `DB_PASSWORD` before starting the server.

Windows PowerShell example:
```powershell
$env:DB_HOST="localhost"
$env:DB_PORT="3306"
$env:DB_USER="root"
$env:DB_PASSWORD="YOUR_MYSQL_PASSWORD"
$env:DB_NAME="hms_db"
```

## Run
```bash
cd backend
npm install
npm start
```
Open **http://localhost:5000**.

## Demo credentials
| Role | Email | Password |
|---|---|---|
| Admin | admin@bhagwant.com | admin123 |
| Doctor | amit@bhagwant.com | doctor123 |
| Doctor | sumit@bhagwant.com | doctor123 |

## Features
- Patients book appointments without login
- MySQL-backed patient, doctor, admin and appointment data
- Double-booking prevention
- Doctor dashboard: stats, filter, Accept / Reject
- Admin dashboard: overview, doctors, appointments, patients
- CRUD operations for doctors and appointments
- Role-based authentication with in-memory session tokens

## API
- `POST /api/login`, `POST /api/logout`
- `GET /api/doctors`, `GET /api/slots?doctor_id=&date=`, `POST /api/appointments`
- `GET /api/doctor/appointments`, `PATCH /api/appointments/:id/status`
- `GET|POST|DELETE /api/admin/doctors`
- `GET|DELETE /api/admin/appointments`
- `GET /api/admin/patients`
