const express = require('express');
const mysql = require('mysql2');

const app = express();
app.use(express.json());

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'PSSMS'
});


db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('Connected to MySQL database');
});
app.post('/api/entry', (req, res) => {
    const { plate, slot } = req.body;

    if (!plate || !slot) {
        return res.status(400).json({ message: "Plate and slot are required" });
    }

    const entryTime = new Date();

    const sql = `
        INSERT INTO ParkingRecord (PlateNumber, SlotNumber, EntryTime) 
        VALUES (?, ?, ?)
    `;

    db.query(sql, [plate, slot, entryTime], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }

        // Update slot to Occupied
        db.query(
            "UPDATE ParkingSlot SET SlotStatus = 'Occupied' WHERE SlotNumber = ?",
            [slot],
            (err2) => {
                if (err2) console.error(err2);
            }
        );

        res.json({ message: "Entry Recorded Successfully" });
    });
});

app.put('/api/exit/:id', (req, res) => {
    const recordId = req.params.id;
    const exitTime = new Date();

    db.query(
        "SELECT EntryTime, SlotNumber, PlateNumber FROM ParkingRecord WHERE RecordID = ?",
        [recordId],
        (err, results) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (results.length === 0) {
                return res.status(404).json({ message: "Record not found" });
            }

            const entryTime = new Date(results[0].EntryTime);
            const slot = results[0].SlotNumber;
            const plate = results[0].PlateNumber;

            // Calculate duration in hours
            let durationHrs = (exitTime - entryTime) / (1000 * 60 * 60);
            if (durationHrs < 1) durationHrs = 1;

            const amount = Math.ceil(durationHrs * 500);

            const updateSql = `
                UPDATE ParkingRecord 
                SET ExitTime = ?, Duration = ? 
                WHERE RecordID = ?
            `;

            db.query(updateSql, [exitTime, durationHrs, recordId], (err2) => {
                if (err2) {
                    return res.status(500).json({ error: err2.message });
                }

                // Free slot
                db.query(
                    "UPDATE ParkingSlot SET SlotStatus = 'Available' WHERE SlotNumber = ?",
                    [slot]
                );

                // Insert payment
                db.query(
                    "INSERT INTO Payment (AmountPaid, PaymentDate, RecordID) VALUES (?, ?, ?)",
                    [amount, exitTime, recordId]
                );

                res.json({
                    plate,
                    duration: durationHrs.toFixed(2),
                    amount
                });
            });
        }
    );
});

app.get('/api/reports/daily', (req, res) => {
    const sql = `
        SELECT pr.PlateNumber, pr.EntryTime, pr.ExitTime, pr.Duration, py.AmountPaid 
        FROM ParkingRecord pr 
        JOIN Payment py ON pr.RecordID = py.RecordID
    `;

    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});


app.listen(5000, () => {
    console.log("Backend running on http://localhost:5000");
});
