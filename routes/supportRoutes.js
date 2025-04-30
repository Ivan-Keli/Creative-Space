const express = require("express");
const router = express.Router();
const { Ticket, User } = require("../models");
const { authMiddleware, authorize } = require("../middleware/authMiddleware");

// ✅ Submit a Support Ticket (User Side)
router.post("/submit", authMiddleware, async (req, res) => {
    try {
        const { subject, message } = req.body;
        const userId = req.user.id;

        const newTicket = await Ticket.create({
            userId,
            subject,
            message,
            status: "open",
        });

        res.status(201).json({ message: "Ticket submitted successfully", ticket: newTicket });
    } catch (error) {
        console.error("Error submitting ticket:", error);
        res.status(500).json({ error: "Error submitting ticket" });
    }
});

// ✅ Admin: Get All Support Tickets
router.get("/", authMiddleware, authorize(["admin"]), async (req, res) => {
    try {
        const tickets = await Ticket.findAll({
            include: [{ model: User, as: 'creator', attributes: ["id", "name", "email"] }],
        });

        res.json(tickets);
    } catch (error) {
        console.error("Error fetching tickets:", error);
        res.status(500).json({ error: "Error fetching tickets" });
    }
});

// ✅ Admin: Close Ticket
router.put("/close/:id", authMiddleware, authorize(["admin"]), async (req, res) => {
    try {
        const ticket = await Ticket.findByPk(req.params.id);
        if (!ticket) return res.status(404).json({ error: "Ticket not found" });

        await ticket.update({ status: "closed" });

        res.json({ message: "Ticket closed successfully", ticket });
    } catch (error) {
        console.error("Error closing ticket:", error);
        res.status(500).json({ error: "Error closing ticket" });
    }
});

module.exports = router;
