const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  name: { type: String, required: true, trim: true },
  role: { type: String, enum: ['admin', 'hr', 'employee'], default: 'employee' },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword = function (c) { return bcrypt.compare(c, this.password); };
userSchema.methods.toSafeObject = function () {
  return { id: this._id, email: this.email, name: this.name, role: this.role, employeeId: this.employeeId, isActive: this.isActive };
};

const employeeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  department: { type: String, required: true },
  designation: { type: String, required: true },
  status: { type: String, enum: ['Active', 'On probation', 'Resigned', 'Terminated'], default: 'Active' },
  joiningDate: { type: Date, required: true },
  salary: { type: Number, required: true, min: 0 },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Male' },
  employmentType: { type: String, enum: ['Full-time', 'Contract', 'Part-time', 'Intern'], default: 'Full-time' },
  manager: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

const leaveRequestSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeCode: String, employeeName: String,
  type: { type: String, enum: ['Annual', 'Sick', 'Casual', 'Unpaid', 'Maternity', 'Paternity'], required: true },
  startDate: Date, endDate: Date, days: Number, reason: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  reviewedBy: String, reviewedAt: Date, comments: String,
}, { timestamps: true });

const leaveBalanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true },
  employeeCode: String,
  balances: { Annual: { type: Number, default: 20 }, Sick: { type: Number, default: 10 }, Casual: { type: Number, default: 8 }, Unpaid: { type: Number, default: 0 }, Maternity: { type: Number, default: 0 }, Paternity: { type: Number, default: 0 } },
  used: { Annual: { type: Number, default: 0 }, Sick: { type: Number, default: 0 }, Casual: { type: Number, default: 0 }, Unpaid: { type: Number, default: 0 }, Maternity: { type: Number, default: 0 }, Paternity: { type: Number, default: 0 } },
}, { timestamps: true });

const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeCode: String, employeeName: String, date: { type: Date, required: true },
  checkIn: String, checkOut: String,
  status: { type: String, enum: ['Present', 'Late', 'Absent', 'On leave', 'Half-day', 'Weekend', 'Holiday'], default: 'Present' },
  notes: String, workHours: { type: Number, default: 0 },
}, { timestamps: true });
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

const attendanceCorrectionSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeCode: String, employeeName: String, date: Date,
  requestedCheckIn: String, requestedCheckOut: String, reason: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: String, reviewedAt: Date,
}, { timestamps: true });

const announcementSchema = new mongoose.Schema({
  title: String, body: String, author: String,
  audience: { type: String, enum: ['all', 'admin', 'hr', 'employee'], default: 'all' },
  pinned: { type: Boolean, default: false }, publishedAt: { type: Date, default: Date.now }, expiresAt: Date,
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String, message: String,
  type: { type: String, default: 'info' }, read: { type: Boolean, default: false }, link: String,
}, { timestamps: true });

const payslipSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeCode: String, employeeName: String, department: String,
  basic: Number, allowances: Number, deductions: Number, tax: Number, net: Number,
  status: { type: String, enum: ['draft', 'processed', 'paid'], default: 'draft' },
});
const payrollSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true },
  status: { type: String, enum: ['draft', 'processing', 'finalized', 'paid'], default: 'draft' },
  totalGross: Number, totalNet: Number, employeeCount: Number,
  payslips: [payslipSchema], finalizedAt: Date, finalizedBy: String,
}, { timestamps: true });

const organizationSchema = new mongoose.Schema({
  name: { type: String, default: 'Northwind Technologies' },
  departments: [{ name: String, head: String, active: { type: Boolean, default: true } }],
  designations: [{ name: String, department: String, active: { type: Boolean, default: true } }],
  leaveTypes: [{ name: String, quota: Number, paid: String, active: { type: Boolean, default: true } }],
  holidays: [{ name: String, date: Date }],
  settings: {
    workStart: { type: String, default: '09:00' }, workEnd: { type: String, default: '18:00' },
    lateThreshold: { type: String, default: '09:15' }, currency: { type: String, default: 'PKR' },
    timezone: { type: String, default: 'Asia/Karachi' }, fiscalYearStart: { type: String, default: '01-01' },
  },
}, { timestamps: true });

const auditLogSchema = new mongoose.Schema({
  actor: String, action: String, entity: String, entityId: String, details: mongoose.Schema.Types.Mixed, ip: String,
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Employee: mongoose.model('Employee', employeeSchema),
  LeaveRequest: mongoose.model('LeaveRequest', leaveRequestSchema),
  LeaveBalance: mongoose.model('LeaveBalance', leaveBalanceSchema),
  Attendance: mongoose.model('Attendance', attendanceSchema),
  AttendanceCorrection: mongoose.model('AttendanceCorrection', attendanceCorrectionSchema),
  Announcement: mongoose.model('Announcement', announcementSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Payroll: mongoose.model('Payroll', payrollSchema),
  Organization: mongoose.model('Organization', organizationSchema),
  AuditLog: mongoose.model('AuditLog', auditLogSchema),
};
