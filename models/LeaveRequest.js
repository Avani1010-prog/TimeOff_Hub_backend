const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        leaveType: {
            type: String,
            enum: ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid', 'Other'],
            required: [true, 'Leave type is required'],
        },
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
        },
        endDate: {
            type: Date,
            required: [true, 'End date is required'],
        },
        reason: {
            type: String,
            required: [true, 'Reason is required'],
            trim: true,
            maxlength: [500, 'Reason cannot exceed 500 characters'],
        },
        status: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected'],
            default: 'Pending',
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
        reviewNote: {
            type: String,
            trim: true,
            default: '',
        },
    },
    { timestamps: true }
);

// Validate that endDate is not before startDate
leaveRequestSchema.pre('save', function (next) {
    if (this.endDate < this.startDate) {
        return next(new Error('End date cannot be before start date'));
    }
    next();
});

// Virtual for number of days
leaveRequestSchema.virtual('totalDays').get(function () {
    const diff = this.endDate - this.startDate;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
});

leaveRequestSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
