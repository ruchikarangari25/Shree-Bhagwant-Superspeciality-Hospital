CREATE DATABASE IF NOT EXISTS hms_db;
USE hms_db;

CREATE TABLE IF NOT EXISTS admins (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS doctors (
  doctor_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  specialization VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(30) DEFAULT '',
  availability VARCHAR(255) DEFAULT 'Mon-Sat, 9 AM - 5 PM'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS patients (
  patient_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) DEFAULT '',
  phone VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_patient_phone_name (phone, name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointments (
  appointment_id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  reason TEXT,
  status ENUM('Pending','Accepted','Rejected') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO admins (email,password,name)
SELECT 'admin@bhagwant.com','admin123','Admin'
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE email='admin@bhagwant.com');

INSERT INTO doctors (name,specialization,email,password,phone,availability)
SELECT 'Dr. Amit D. Padwal','Neurosurgeon','amit@bhagwant.com','doctor123','9876500001','Mon-Sat, 9 AM - 5 PM'
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE email='amit@bhagwant.com');

INSERT INTO doctors (name,specialization,email,password,phone,availability)
SELECT 'Dr. Sumit D. Padwal','Orthopaedic Surgeon','sumit@bhagwant.com','doctor123','9876500002','Mon-Sat, 9 AM - 5 PM'
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE email='sumit@bhagwant.com');


CREATE DATABASE hms_db;
USE hms_db;

SHOW TABLES;


