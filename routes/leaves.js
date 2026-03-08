const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const LeaveRequest = require('../models/LeaveRequest');
const { protect, authorize } = require('../middleware/auth');

// Helper: send validation errors
const handleValidationErrors = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    return null;
};

// @route   POST /api/leaves
// @desc    Employee: Apply for leave
// @access  Private (Employee only)
router.post(
    '/',
    protect,
    authorize('employee'),
    [
        body('leaveType')
            .isIn(['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid', 'Other'])
            .withMessage('Invalid leave type'),
        body('startDate').isISO8601().withMessage('Start date must be a valid date'),
        body('endDate').isISO8601().withMessage('End date must be a valid date'),
        body('reason').trim().notEmpty().withMessage('Reason is required'),
    ],
    async (req, res) => {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        try {
            const { leaveType, startDate, endDate, reason } = req.body;

            const start = new Date(startDate);
            const end = new Date(endDate);

            if (end < start) {
                return res.status(400).json({
                    success: false,
                    message: 'End date cannot be before start date.',
                });
            }

            if (start < new Date(new Date().setHours(0, 0, 0, 0))) {
                return res.status(400).json({
                    success: false,
                    message: 'Start date cannot be in the past.',
                });
            }

            const leave = await LeaveRequest.create({
                employee: req.user._id,
                leaveType,
                startDate: start,
                endDate: end,
                reason,
            });

            await leave.populate('employee', 'name email department');

            res.status(201).json({
                success: true,
                message: 'Leave request submitted successfully.',
                leave,
            });
        } catch (error) {
            console.error('Apply leave error:', error.message);
            res.status(500).json({ success: false, message: 'Server error. Please try again.' });
        }
    }
);

// @route   GET /api/leaves/my
// @desc    Employee: Get own leave requests
// @access  Private (Employee only)
router.get('/my', protect, authorize('employee'), async (req, res) => {
    try {
        const leaves = await LeaveRequest.find({ employee: req.user._id })
            .populate('reviewedBy', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: leaves.length, leaves });
    } catch (error) {
        console.error('Get my leaves error:', error.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// @route   GET /api/leaves
// @desc    Employer: Get all employee leave requests (active users only)
// @access  Private (Employer only)
router.get('/', protect, authorize('employer'), async (req, res) => {
    try {
        const { status, leaveType } = req.query;
        const filter = {};

        if (status && ['Pending', 'Approved', 'Rejected'].includes(status)) {
            filter.status = status;
        }
        if (leaveType) {
            filter.leaveType = leaveType;
        }

        const allLeaves = await LeaveRequest.find(filter)
            .populate('employee', 'name email department gender')
            .populate('reviewedBy', 'name email')
            .sort({ createdAt: -1 });

        // Remove orphaned leaves where the employee account has been deleted
        const leaves = allLeaves.filter(l => l.employee != null);

        res.status(200).json({ success: true, count: leaves.length, leaves });
    } catch (error) {
        console.error('Get all leaves error:', error.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// @route   GET /api/leaves/employee/:employeeId
// @desc    Employer: Get all leave history for a specific employee
// @access  Private (Employer only)
router.get('/employee/:employeeId', protect, authorize('employer'), async (req, res) => {
    try {
        const allLeaves = await LeaveRequest.find({ employee: req.params.employeeId })
            .populate('employee', 'name email department gender')
            .populate('reviewedBy', 'name email')
            .sort({ createdAt: -1 });

        // Filter orphaned (employee deleted)
        const leaves = allLeaves.filter(l => l.employee != null);

        // Aggregate statistics on valid leaves only
        const stats = {
            total: leaves.length,
            pending: leaves.filter(l => l.status === 'Pending').length,
            approved: leaves.filter(l => l.status === 'Approved').length,
            rejected: leaves.filter(l => l.status === 'Rejected').length,
            totalDaysApproved: leaves
                .filter(l => l.status === 'Approved')
                .reduce((sum, l) => sum + (l.totalDays || 0), 0),
        };

        res.status(200).json({ success: true, count: leaves.length, leaves, stats });
    } catch (error) {
        console.error('Get employee history error:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});


// @route   PATCH /api/leaves/:id/review
// @desc    Employer: Approve or reject a leave request
// @access  Private (Employer only)
router.patch(
    '/:id/review',
    protect,
    authorize('employer'),
    [
        body('status')
            .isIn(['Approved', 'Rejected'])
            .withMessage('Status must be Approved or Rejected'),
    ],
    async (req, res) => {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        try {
            const leave = await LeaveRequest.findById(req.params.id);

            if (!leave) {
                return res.status(404).json({ success: false, message: 'Leave request not found.' });
            }

            if (leave.status !== 'Pending') {
                return res.status(400).json({
                    success: false,
                    message: `This leave request has already been ${leave.status.toLowerCase()}.`,
                });
            }

            leave.status = req.body.status;
            leave.reviewedBy = req.user._id;
            leave.reviewedAt = new Date();
            leave.reviewNote = req.body.reviewNote || '';

            await leave.save();
            await leave.populate('employee', 'name email department');
            await leave.populate('reviewedBy', 'name email');

            res.status(200).json({
                success: true,
                message: `Leave request ${req.body.status.toLowerCase()} successfully.`,
                leave,
            });
        } catch (error) {
            console.error('Review leave error:', error.message);
            if (error.kind === 'ObjectId') {
                return res.status(404).json({ success: false, message: 'Leave request not found.' });
            }
            res.status(500).json({ success: false, message: 'Server error.' });
        }
    }
);

// @route   DELETE /api/leaves/:id
// @desc    Employee: Delete own pending leave request
// @access  Private (Employee only)
router.delete('/:id', protect, authorize('employee'), async (req, res) => {
    try {
        const leave = await LeaveRequest.findOne({ _id: req.params.id, employee: req.user._id });

        if (!leave) {
            return res.status(404).json({ success: false, message: 'Leave request not found.' });
        }

        if (leave.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending leave requests can be deleted.',
            });
        }

        await leave.deleteOne();

        res.status(200).json({ success: true, message: 'Leave request deleted successfully.' });
    } catch (error) {
        console.error('Delete leave error:', error.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
