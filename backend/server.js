require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hms_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const STATUSES = ['Pending', 'Accepted', 'Rejected'];
const TIME_SLOTS = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'];
const sessions = new Map();

async function dbQuery(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function initializeDatabase() {
  // Database itself must exist before this application connects to hms_db.
  const [rows] = await pool.query('SELECT DATABASE() AS db');
  if (!rows[0].db) throw new Error('No database selected. Create hms_db and configure DB_NAME.');

  await dbQuery(`CREATE TABLE IF NOT EXISTS admins (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL
  ) ENGINE=InnoDB`);

  await dbQuery(`CREATE TABLE IF NOT EXISTS doctors (
    doctor_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    specialization VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(30) DEFAULT '',
    availability VARCHAR(255) DEFAULT 'Mon-Sat, 9 AM - 5 PM'
  ) ENGINE=InnoDB`);

  await dbQuery(`CREATE TABLE IF NOT EXISTS patients (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) DEFAULT '',
    phone VARCHAR(30) NOT NULL,
    UNIQUE KEY uq_patient_phone_name (phone, name)
  ) ENGINE=InnoDB`);

  await dbQuery(`CREATE TABLE IF NOT EXISTS appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    reason TEXT,
    status ENUM('Pending','Accepted','Rejected') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appointment_patient FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_appointment_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    INDEX idx_appointment_doctor_date (doctor_id, date),
    INDEX idx_appointment_patient (patient_id)
  ) ENGINE=InnoDB`);

  // A rejected appointment does not occupy a slot, so the unique rule is enforced in application logic.
  // The transaction below prevents concurrent double-booking.
  const admins = await dbQuery('SELECT admin_id FROM admins LIMIT 1');
  if (!admins.length) {
    await dbQuery('INSERT INTO admins (email,password,name) VALUES (?,?,?)', ['admin@bhagwant.com', 'admin123', 'Admin']);
  }

  const doctors = await dbQuery('SELECT doctor_id FROM doctors LIMIT 1');
  if (!doctors.length) {
    await dbQuery(
      `INSERT INTO doctors (name,specialization,email,password,phone,availability) VALUES
       (?,?,?,?,?,?), (?,?,?,?,?,?)`,
      [
        'Dr. Amit D. Padwal', 'Neurosurgeon', 'amit@bhagwant.com', 'doctor123', '9876500001', 'Mon-Sat, 9 AM - 5 PM',
        'Dr. Sumit D. Padwal', 'Orthopaedic Surgeon', 'sumit@bhagwant.com', 'doctor123', '9876500002', 'Mon-Sat, 9 AM - 5 PM'
      ]
    );
  }
}

function auth(roles) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const s = sessions.get(token);
    if (!s) return res.status(401).json({ error: 'Not authenticated' });
    if (roles && !roles.includes(s.role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = s;
    next();
  };
}

const publicDoctor = d => ({
  doctor_id: d.doctor_id,
  name: d.name,
  specialization: d.specialization,
  availability: d.availability,
  email: d.email,
  phone: d.phone
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    let rows = await dbQuery('SELECT * FROM admins WHERE email = ? AND password = ? LIMIT 1', [email, password]);
    let user = rows[0];
    let role = 'admin';
    let id = user && user.admin_id;

    if (!user) {
      rows = await dbQuery('SELECT * FROM doctors WHERE email = ? AND password = ? LIMIT 1', [email, password]);
      user = rows[0];
      role = 'doctor';
      id = user && user.doctor_id;
    }
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { role, id });
    res.json({ token, role, user: { id, name: user.name, email: user.email, specialization: user.specialization, availability: user.availability } });
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.post('/api/logout', auth(), (req, res) => {
  sessions.delete((req.headers.authorization || '').replace('Bearer ', ''));
  res.json({ ok: true });
});

app.get('/api/doctors', async (req, res) => {
  try { res.json((await dbQuery('SELECT * FROM doctors ORDER BY doctor_id')).map(publicDoctor)); }
  catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.get('/api/slots', async (req, res) => {
  try {
    const { doctor_id, date } = req.query;
    const rows = await dbQuery(
      `SELECT time_slot FROM appointments WHERE doctor_id = ? AND date = ? AND status <> 'Rejected'`,
      [doctor_id, date]
    );
    const taken = rows.map(r => r.time_slot);
    res.json(TIME_SLOTS.map(t => ({ time: t, available: !taken.includes(t) })));
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.post('/api/appointments', async (req, res) => {
  const { name, phone, email, doctor_id, date, time_slot, reason } = req.body || {};
  if (!name || !phone || !doctor_id || !date || !time_slot)
    return res.status(400).json({ error: 'Name, phone, doctor, date and time slot are required' });
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Phone must be a 10-digit number' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [doctors] = await conn.execute('SELECT * FROM doctors WHERE doctor_id = ? FOR UPDATE', [doctor_id]);
    if (!doctors.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Doctor not found' });
    }

    const [clashes] = await conn.execute(
      `SELECT appointment_id FROM appointments
       WHERE doctor_id = ? AND date = ? AND time_slot = ? AND status <> 'Rejected'
       FOR UPDATE`,
      [doctor_id, date, time_slot]
    );
    if (clashes.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'This doctor is already booked for that date and time slot' });
    }

    const [patients] = await conn.execute(
      'SELECT * FROM patients WHERE phone = ? AND LOWER(name) = LOWER(?) LIMIT 1 FOR UPDATE',
      [phone, name]
    );

    let patientId;
    if (patients.length) {
      patientId = patients[0].patient_id;
      await conn.execute('UPDATE patients SET email = ? WHERE patient_id = ?', [email || '', patientId]);
    } else {
      const [result] = await conn.execute(
        'INSERT INTO patients (name,email,phone) VALUES (?,?,?)',
        [name, email || '', phone]
      );
      patientId = result.insertId;
    }

    const [result] = await conn.execute(
      `INSERT INTO appointments (patient_id,doctor_id,date,time_slot,reason,status)
       VALUES (?,?,?,?,?,'Pending')`,
      [patientId, Number(doctor_id), date, time_slot, reason || '']
    );

    await conn.commit();
    res.status(201).json({
      appointment_id: result.insertId,
      patient_id: patientId,
      doctor_id: Number(doctor_id),
      date, time_slot,
      reason: reason || '',
      status: 'Pending'
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This record already exists' });
    res.status(500).json({ error: 'Database error', detail: err.message });
  } finally { conn.release(); }
});

async function expandAppointment(a) {
  return {
    ...a,
    appointment_id: Number(a.appointment_id),
    patient_id: Number(a.patient_id),
    doctor_id: Number(a.doctor_id),
    patient_name: a.patient_name,
    patient_phone: a.patient_phone,
    patient_email: a.patient_email,
    doctor_name: a.doctor_name,
    specialization: a.specialization
  };
}

const appointmentSelect = `
  SELECT a.*, p.name AS patient_name, p.phone AS patient_phone, p.email AS patient_email,
         d.name AS doctor_name, d.specialization
  FROM appointments a
  JOIN patients p ON p.patient_id = a.patient_id
  JOIN doctors d ON d.doctor_id = a.doctor_id`;

app.get('/api/doctor/appointments', auth(['doctor']), async (req, res) => {
  try {
    const rows = await dbQuery(`${appointmentSelect} WHERE a.doctor_id = ? ORDER BY a.date, a.time_slot`, [req.user.id]);
    res.json(await Promise.all(rows.map(expandAppointment)));
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.patch('/api/appointments/:id/status', auth(['doctor', 'admin']), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const rows = await dbQuery('SELECT * FROM appointments WHERE appointment_id = ?', [req.params.id]);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Appointment not found' });
    if (req.user.role === 'doctor' && Number(a.doctor_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Not your appointment' });
    await dbQuery('UPDATE appointments SET status = ? WHERE appointment_id = ?', [status, req.params.id]);
    const updated = await dbQuery(`${appointmentSelect} WHERE a.appointment_id = ?`, [req.params.id]);
    res.json(await expandAppointment(updated[0]));
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.get('/api/admin/appointments', auth(['admin']), async (req, res) => {
  try {
    const rows = await dbQuery(`${appointmentSelect} ORDER BY a.created_at DESC`);
    res.json(await Promise.all(rows.map(expandAppointment)));
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.delete('/api/admin/appointments/:id', auth(['admin']), async (req, res) => {
  try {
    const result = await dbQuery('DELETE FROM appointments WHERE appointment_id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.get('/api/admin/patients', auth(['admin']), async (req, res) => {
  try {
    const rows = await dbQuery(`
      SELECT p.*, COUNT(a.appointment_id) AS appointments
      FROM patients p LEFT JOIN appointments a ON a.patient_id = p.patient_id
      GROUP BY p.patient_id ORDER BY p.patient_id`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.get('/api/admin/doctors', auth(['admin']), async (req, res) => {
  try {
    const rows = await dbQuery(`
      SELECT d.*, COUNT(a.appointment_id) AS appointments
      FROM doctors d LEFT JOIN appointments a ON a.doctor_id = d.doctor_id
      GROUP BY d.doctor_id ORDER BY d.doctor_id`);
    res.json(rows.map(d => ({ ...publicDoctor(d), appointments: Number(d.appointments) })));
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.post('/api/admin/doctors', auth(['admin']), async (req, res) => {
  const { name, specialization, email, password, phone, availability } = req.body || {};
  if (!name || !specialization || !email || !password) return res.status(400).json({ error: 'Name, specialization, email and password are required' });
  try {
    const existing = await dbQuery(
      `SELECT email FROM doctors WHERE email = ? UNION SELECT email FROM admins WHERE email = ? LIMIT 1`,
      [email, email]
    );
    if (existing.length) return res.status(409).json({ error: 'Email already in use' });
    const result = await dbQuery(
      'INSERT INTO doctors (name,specialization,email,password,phone,availability) VALUES (?,?,?,?,?,?)',
      [name, specialization, email, password, phone || '', availability || 'Mon-Sat, 9 AM - 5 PM']
    );
    const rows = await dbQuery('SELECT * FROM doctors WHERE doctor_id = ?', [result.insertId]);
    res.status(201).json(publicDoctor(rows[0]));
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

app.delete('/api/admin/doctors/:id', auth(['admin']), async (req, res) => {
  try {
    const pending = await dbQuery("SELECT appointment_id FROM appointments WHERE doctor_id = ? AND status = 'Pending' LIMIT 1", [req.params.id]);
    if (pending.length) return res.status(409).json({ error: 'Doctor has pending appointments' });
    const result = await dbQuery('DELETE FROM doctors WHERE doctor_id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Database error', detail: err.message }); }
});

const FRONT = path.join(__dirname, '..', 'frontend');

if (require('fs').existsSync(FRONT)) {
    app.use(express.static(FRONT));
}

app.get('/', (req, res) => {
    res.sendFile(path.join(FRONT, 'index.html'));
});

initializeDatabase()
  .then(() => app.listen(PORT, () => console.log(`HMS API running on http://localhost:${PORT}`)))
  .catch(err => {
    console.error('\nDatabase connection failed. Make sure MySQL is running and hms_db exists.');
    console.error(err.message);
    process.exit(1);
  });
