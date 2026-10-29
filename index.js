require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { protect, authorize } = require('./middleware/auth');
const {
  User, Employee, LeaveRequest, LeaveBalance, Attendance, AttendanceCorrection,
  Announcement, Notification, Payroll, Organization, AuditLog
} = require('./models');

const app = express();
const PORT = process.env.PORT || 5000;
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

app.use(helmet());
app.use(cors({ origin: [process.env.CLIENT_URL || 'http://localhost:5173', 'http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many attempts' } }));

app.get('/api/health', (req, res) => {
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({ status: 'ok', timestamp: new Date().toISOString(), database: { status: states[mongoose.connection.readyState] || 'unknown', connected: mongoose.connection.readyState === 1, name: mongoose.connection.name || null } });
});

// AUTH
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password, name, role = 'employee' } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name required' });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ error: 'Email already registered' });
    const safeRole = ['employee', 'hr'].includes(role) ? role : 'employee';
    let employee = null;
    if (safeRole === 'employee' || safeRole === 'hr') {
      const count = await Employee.countDocuments();
      const code = `EMP-${2001 + count}`;
      employee = await Employee.create({
        code,
        name,
        email: email.toLowerCase(),
        department: safeRole === 'hr' ? 'Human Resources' : 'Engineering',
        designation: safeRole === 'hr' ? 'HR Executive' : 'Software Engineer',
        status: 'Active',
        joiningDate: new Date(),
        salary: 100000,
        gender: 'Male',
        employmentType: 'Full-time',
        phone: '',
        address: '',
        manager: '',
      });
      try {
        await LeaveBalance.create({
          employee: employee._id,
          employeeCode: code,
          balances: { Annual: 20, Sick: 10, Casual: 8, Unpaid: 0, Maternity: 0, Paternity: 0 },
          used: { Annual: 0, Sick: 0, Casual: 0, Unpaid: 0, Maternity: 0, Paternity: 0 },
        });
      } catch (_) { }
    }
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      name,
      role: safeRole,
      employeeId: employee ? employee._id : null,
    });
    if (employee) {
      await Employee.findByIdAndUpdate(employee._id, { userId: user._id });
    }
    const safe = user.toSafeObject();
    res.status(201).json({
      token: signToken(user._id),
      user: {
        ...safe,
        employeeCode: employee?.code || null,
        employeeId: employee?.code || null,
        department: employee?.department || null,
      },
    });
  } catch (e) { next(e); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.isActive) return res.status(401).json({ error: 'Account deactivated' });
    let employee = null;
    if (user.employeeId) employee = await Employee.findById(user.employeeId);
    res.json({ token: signToken(user._id), user: { ...user.toSafeObject(), employeeCode: employee?.code || null, department: employee?.department || null } });
  } catch (e) { next(e); }
});
app.get('/api/auth/verify', protect, (req, res) => res.json({ valid: true, user: req.user.toSafeObject() }));
app.get('/api/auth/me', protect, async (req, res, next) => {
  try {
    let employee = null;
    if (req.user.employeeId) employee = await Employee.findById(req.user.employeeId);
    res.json({ user: { ...req.user.toSafeObject(), employeeCode: employee?.code || null, department: employee?.department || null } });
  } catch (e) { next(e); }
});

// EMPLOYEES
app.get('/api/employees', protect, async (req, res, next) => {
  try {
    const { search, department, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (status) filter.status = status;
    if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }, { code: new RegExp(search, 'i') }];
    const skip = (Math.max(1, +page) - 1) * +limit;
    const [items, total] = await Promise.all([Employee.find(filter).sort({ code: 1 }).skip(skip).limit(+limit), Employee.countDocuments(filter)]);
    res.json({ items, total, page: +page, limit: +limit });
  } catch (e) { next(e); }
});
app.get('/api/employees/:id', protect, async (req, res, next) => {
  try {
    const emp = await Employee.findById(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json(emp);
  } catch (e) { next(e); }
});
app.post('/api/employees', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (!data.code) { const count = await Employee.countDocuments(); data.code = `EMP-${1001 + count}`; }
    const emp = await Employee.create(data);
    await LeaveBalance.create({ employee: emp._id, employeeCode: emp.code, balances: { Annual: 20, Sick: 10, Casual: 8, Unpaid: 0, Maternity: 0, Paternity: 0 }, used: { Annual: 0, Sick: 0, Casual: 0, Unpaid: 0, Maternity: 0, Paternity: 0 } });
    await AuditLog.create({ actor: req.user.name, action: 'CREATE', entity: 'Employee', entityId: emp._id.toString() });
    res.status(201).json(emp);
  } catch (e) { next(e); }
});
app.patch('/api/employees/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const emp = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!emp) return res.status(404).json({ error: 'Not found' });
    res.json(emp);
  } catch (e) { next(e); }
});
app.delete('/api/employees/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const emp = await Employee.findByIdAndDelete(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Not found' });
    await LeaveBalance.deleteOne({ employee: emp._id });
    res.json({ message: 'Deleted', id: emp._id });
  } catch (e) { next(e); }
});

// LEAVE
app.get('/api/leave/requests', protect, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.user.role === 'employee' && req.user.employeeId) filter.employee = req.user.employeeId;
    else if (req.query.employeeId) filter.employee = req.query.employeeId;
    res.json(await LeaveRequest.find(filter).sort({ createdAt: -1 }).limit(100));
  } catch (e) { next(e); }
});
app.get('/api/leave/balances', protect, async (req, res, next) => {
  try {
    let employeeId = req.query.employeeId;
    if (req.user.role === 'employee') employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
    let bal = await LeaveBalance.findOne({ employee: employeeId });
    if (!bal) {
      const emp = await Employee.findById(employeeId);
      if (!emp) return res.status(404).json({ error: 'Employee not found' });
      bal = await LeaveBalance.create({ employee: emp._id, employeeCode: emp.code, balances: { Annual: 20, Sick: 10, Casual: 8, Unpaid: 0, Maternity: 0, Paternity: 0 }, used: { Annual: 0, Sick: 0, Casual: 0, Unpaid: 0, Maternity: 0, Paternity: 0 } });
    }
    const remaining = {};
    for (const k of Object.keys(bal.balances)) remaining[k] = Math.max(0, (bal.balances[k] || 0) - (bal.used[k] || 0));
    res.json({ ...bal.toObject(), remaining });
  } catch (e) { next(e); }
});
app.post('/api/leave/requests', protect, async (req, res, next) => {
  try {
    let employeeId = req.body.employeeId || req.user.employeeId;
    if (req.user.role === 'employee') employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'Employee required' });
    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const start = new Date(req.body.startDate), end = new Date(req.body.endDate);
    const days = req.body.days || Math.max(1, Math.ceil((end - start) / 86400000) + 1);
    const doc = await LeaveRequest.create({ employee: emp._id, employeeCode: emp.code, employeeName: emp.name, type: req.body.type || 'Casual', startDate: start, endDate: end, days, reason: req.body.reason || '', status: 'pending' });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});
app.patch('/api/leave/requests/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const { status, comments } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });
    const doc = await LeaveRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.status !== 'pending') return res.status(400).json({ error: 'Already decided' });
    doc.status = status; doc.reviewedBy = req.user.name; doc.reviewedAt = new Date(); doc.comments = comments || '';
    await doc.save();
    if (status === 'approved') {
      const bal = await LeaveBalance.findOne({ employee: doc.employee });
      if (bal && bal.used[doc.type] !== undefined) { bal.used[doc.type] = (bal.used[doc.type] || 0) + doc.days; await bal.save(); }
    }
    res.json(doc);
  } catch (e) { next(e); }
});

// ATTENDANCE
app.get('/api/attendance/board', protect, async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date); nextDay.setDate(nextDay.getDate() + 1);
    const records = await Attendance.find({ date: { $gte: date, $lt: nextDay } }).sort({ employeeName: 1 });
    const summary = { present: records.filter(r => r.status === 'Present').length, late: records.filter(r => r.status === 'Late').length, absent: records.filter(r => r.status === 'Absent').length, onLeave: records.filter(r => r.status === 'On leave').length, total: records.length };
    res.json({ date: date.toISOString().slice(0, 10), records, summary });
  } catch (e) { next(e); }
});
app.post('/api/attendance/check-in', protect, async (req, res, next) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'No employee linked' });
    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const next = new Date(today); next.setDate(next.getDate() + 1);
    let record = await Attendance.findOne({ employee: employeeId, date: { $gte: today, $lt: next } });
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const status = time > '09:15' ? 'Late' : 'Present';
    if (record) {
      if (record.checkIn) return res.status(400).json({ error: 'Already checked in' });
      record.checkIn = time; record.status = status; await record.save();
    } else {
      record = await Attendance.create({ employee: emp._id, employeeCode: emp.code, employeeName: emp.name, date: today, checkIn: time, status });
    }
    res.json(record);
  } catch (e) { next(e); }
});
app.post('/api/attendance/check-out', protect, async (req, res, next) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'No employee linked' });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const next = new Date(today); next.setDate(next.getDate() + 1);
    const record = await Attendance.findOne({ employee: employeeId, date: { $gte: today, $lt: next } });
    if (!record || !record.checkIn) return res.status(400).json({ error: 'Must check in first' });
    if (record.checkOut) return res.status(400).json({ error: 'Already checked out' });
    const now = new Date();
    record.checkOut = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const [h1, m1] = record.checkIn.split(':').map(Number);
    const [h2, m2] = record.checkOut.split(':').map(Number);
    record.workHours = Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
    await record.save();
    res.json(record);
  } catch (e) { next(e); }
});
app.get('/api/attendance/corrections', protect, async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'employee' && req.user.employeeId) filter.employee = req.user.employeeId;
    if (req.query.status) filter.status = req.query.status;
    res.json(await AttendanceCorrection.find(filter).sort({ createdAt: -1 }).limit(50));
  } catch (e) { next(e); }
});
app.post('/api/attendance/corrections', protect, async (req, res, next) => {
  try {
    const employeeId = req.user.employeeId || req.body.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'Employee required' });
    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ error: 'Not found' });
    const doc = await AttendanceCorrection.create({
      employee: emp._id, employeeCode: emp.code, employeeName: emp.name, date: new Date(req.body.date),
      requestedCheckIn: req.body.requestedCheckIn || req.body.checkIn, requestedCheckOut: req.body.requestedCheckOut || req.body.checkOut,
      reason: req.body.reason || '', status: 'pending',
    });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});
app.patch('/api/attendance/corrections/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const doc = await AttendanceCorrection.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.status !== 'pending') return res.status(400).json({ error: 'Already decided' });
    doc.status = status; doc.reviewedBy = req.user.name; doc.reviewedAt = new Date(); await doc.save();
    if (status === 'approved') {
      const dayStart = new Date(doc.date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      let att = await Attendance.findOne({ employee: doc.employee, date: { $gte: dayStart, $lt: dayEnd } });
      if (att) { if (doc.requestedCheckIn) att.checkIn = doc.requestedCheckIn; if (doc.requestedCheckOut) att.checkOut = doc.requestedCheckOut; att.status = 'Present'; await att.save(); }
      else await Attendance.create({ employee: doc.employee, employeeCode: doc.employeeCode, employeeName: doc.employeeName, date: dayStart, checkIn: doc.requestedCheckIn, checkOut: doc.requestedCheckOut, status: 'Present' });
    }
    res.json(doc);
  } catch (e) { next(e); }
});
app.get('/api/attendance/me', protect, async (req, res, next) => {
  try {
    if (!req.user.employeeId) return res.status(400).json({ error: 'No employee linked' });
    const filter = { employee: req.user.employeeId };
    if (req.query.from || req.query.to) { filter.date = {}; if (req.query.from) filter.date.$gte = new Date(req.query.from); if (req.query.to) filter.date.$lte = new Date(req.query.to); }
    res.json(await Attendance.find(filter).sort({ date: -1 }).limit(60));
  } catch (e) { next(e); }
});

// ANNOUNCEMENTS
app.get('/api/announcements', protect, async (req, res, next) => {
  try {
    res.json(await Announcement.find({ $or: [{ audience: 'all' }, { audience: req.user.role }] }).sort({ pinned: -1, publishedAt: -1 }).limit(50));
  } catch (e) { next(e); }
});
app.get('/api/announcements/:id', protect, async (req, res, next) => {
  try {
    const item = await Announcement.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { next(e); }
});
app.post('/api/announcements', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const item = await Announcement.create({ ...req.body, author: req.user.name, publishedAt: new Date() });
    res.status(201).json(item);
  } catch (e) { next(e); }
});
app.patch('/api/announcements/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const item = await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { next(e); }
});
app.delete('/api/announcements/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (e) { next(e); }
});

// NOTIFICATIONS
app.get('/api/notifications', protect, async (req, res, next) => {
  try { res.json(await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50)); } catch (e) { next(e); }
});
app.patch('/api/notifications/:id/read', protect, async (req, res, next) => {
  try {
    const item = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { read: true }, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { next(e); }
});
app.patch('/api/notifications/read-all', protect, async (req, res, next) => {
  try { await Notification.updateMany({ user: req.user._id, read: false }, { read: true }); res.json({ message: 'All marked as read' }); } catch (e) { next(e); }
});

// PAYROLL
app.get('/api/payroll/payslips', protect, async (req, res, next) => {
  try {
    let employeeId = req.query.employeeId;
    if (req.user.role === 'employee') employeeId = req.user.employeeId;
    if (employeeId) {
      const payrolls = await Payroll.find({ 'payslips.employee': employeeId }).sort({ month: -1 });
      const slips = [];
      for (const p of payrolls) {
        const slip = p.payslips.find(s => s.employee.toString() === employeeId.toString());
        if (slip) slips.push({ ...slip.toObject(), month: p.month, payrollStatus: p.status });
      }
      return res.json(slips);
    }
    const latest = await Payroll.findOne().sort({ month: -1 });
    res.json(latest ? latest.payslips : []);
  } catch (e) { next(e); }
});
app.get('/api/payroll/:month', protect, async (req, res, next) => {
  try {
    const payroll = await Payroll.findOne({ month: req.params.month });
    if (!payroll) return res.status(404).json({ error: 'Not found' });
    res.json(payroll);
  } catch (e) { next(e); }
});
app.post('/api/payroll', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ error: 'month required' });
    if (await Payroll.findOne({ month })) return res.status(400).json({ error: 'Already exists' });
    const employees = await Employee.find({ status: { $ne: 'Resigned' } });
    const payslips = employees.map(e => {
      const basic = e.salary, allowances = Math.round(basic * 0.15), deductions = Math.round(basic * 0.05), tax = Math.round(basic * 0.08);
      return { employee: e._id, employeeCode: e.code, employeeName: e.name, department: e.department, basic, allowances, deductions, tax, net: basic + allowances - deductions - tax, status: 'draft' };
    });
    const payroll = await Payroll.create({ month, status: 'draft', totalGross: payslips.reduce((s, p) => s + p.basic + p.allowances, 0), totalNet: payslips.reduce((s, p) => s + p.net, 0), employeeCount: payslips.length, payslips });
    res.status(201).json(payroll);
  } catch (e) { next(e); }
});
app.post('/api/payroll/:month/status', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const payroll = await Payroll.findOne({ month: req.params.month });
    if (!payroll) return res.status(404).json({ error: 'Not found' });
    payroll.status = req.body.status;
    if (['finalized', 'paid'].includes(req.body.status)) { payroll.finalizedAt = new Date(); payroll.finalizedBy = req.user.name; payroll.payslips.forEach(p => { p.status = req.body.status === 'paid' ? 'paid' : 'processed'; }); }
    await payroll.save();
    res.json(payroll);
  } catch (e) { next(e); }
});

// ORGANIZATION
app.get('/api/organization', protect, async (req, res, next) => {
  try { let org = await Organization.findOne(); if (!org) org = await Organization.create({ name: 'Northwind Technologies' }); res.json(org); } catch (e) { next(e); }
});
app.get('/api/organization/departments', protect, async (req, res, next) => {
  try { const org = await Organization.findOne(); res.json(org?.departments || []); } catch (e) { next(e); }
});
app.post('/api/organization/departments', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try { const org = await Organization.findOne(); org.departments.push(req.body); await org.save(); res.status(201).json(org.departments[org.departments.length - 1]); } catch (e) { next(e); }
});
app.patch('/api/organization/departments/:id', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try { const org = await Organization.findOne(); const d = org.departments.id(req.params.id); if (!d) return res.status(404).json({ error: 'Not found' }); Object.assign(d, req.body); await org.save(); res.json(d); } catch (e) { next(e); }
});
app.get('/api/organization/leave-types', protect, async (req, res, next) => {
  try { const org = await Organization.findOne(); res.json(org?.leaveTypes || []); } catch (e) { next(e); }
});
app.post('/api/organization/leave-types', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try { const org = await Organization.findOne(); org.leaveTypes.push(req.body); await org.save(); res.status(201).json(org.leaveTypes[org.leaveTypes.length - 1]); } catch (e) { next(e); }
});
app.get('/api/organization/holidays', protect, async (req, res, next) => {
  try { const org = await Organization.findOne(); res.json(org?.holidays || []); } catch (e) { next(e); }
});
app.post('/api/organization/holidays', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try { const org = await Organization.findOne(); org.holidays.push(req.body); await org.save(); res.status(201).json(org.holidays[org.holidays.length - 1]); } catch (e) { next(e); }
});
app.get('/api/organization/settings', protect, async (req, res, next) => {
  try { const org = await Organization.findOne(); res.json(org?.settings || {}); } catch (e) { next(e); }
});
app.patch('/api/organization/settings', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try { const org = await Organization.findOne(); org.settings = { ...(org.settings?.toObject?.() || org.settings || {}), ...req.body }; await org.save(); res.json(org.settings); } catch (e) { next(e); }
});

// DASHBOARD
app.get('/api/dashboard/admin', protect, authorize('admin'), async (req, res, next) => {
  try {
    const active = await Employee.find({ status: { $ne: 'Resigned' } });
    const headcount = active.length;
    const male = active.filter(e => e.gender === 'Male').length;
    const female = active.filter(e => e.gender === 'Female').length;
    const avgSalary = headcount ? Math.round(active.reduce((s, e) => s + e.salary, 0) / headcount) : 0;
    const payrollExpense = active.reduce((s, e) => s + e.salary, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const todayAtt = await Attendance.find({ date: { $gte: today, $lt: tomorrow } });
    const present = todayAtt.filter(a => a.status === 'Present' || a.status === 'Late').length;
    const attendanceRate = todayAtt.length ? +((present / todayAtt.length) * 100).toFixed(1) : 93.4;
    res.json({ headcount, headcountGrowth: 3, attrition: 4.2, averageSalary: avgSalary, payrollExpense, attendanceRate, stats: { maleEmployees: male, femaleEmployees: female, avgTenure: 2.3 } });
  } catch (e) { next(e); }
});
app.get('/api/dashboard/hr', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const todayAtt = await Attendance.find({ date: { $gte: today, $lt: tomorrow } });
    res.json({
      presentToday: todayAtt.filter(a => a.status === 'Present' || a.status === 'Late').length,
      absentToday: todayAtt.filter(a => a.status === 'Absent').length,
      leavePending: await LeaveRequest.countDocuments({ status: 'pending' }),
      totalEmployees: await Employee.countDocuments({ status: { $ne: 'Resigned' } }),
      attendanceTrend: [{ day: 'Mon', present: 38, absent: 6 }, { day: 'Tue', present: 39, absent: 5 }, { day: 'Wed', present: 37, absent: 7 }, { day: 'Thu', present: 40, absent: 4 }, { day: 'Fri', present: 36, absent: 8 }],
    });
  } catch (e) { next(e); }
});
app.get('/api/dashboard/employee', protect, async (req, res, next) => {
  try {
    let presentToday = false, leaveBalance = { casual: 8, sick: 5, annual: 12 };
    if (req.user.employeeId) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const att = await Attendance.findOne({ employee: req.user.employeeId, date: { $gte: today, $lt: tomorrow } });
      presentToday = !!(att && (att.status === 'Present' || att.status === 'Late'));
      const bal = await LeaveBalance.findOne({ employee: req.user.employeeId });
      if (bal) leaveBalance = { casual: Math.max(0, (bal.balances.Casual || 0) - (bal.used.Casual || 0)), sick: Math.max(0, (bal.balances.Sick || 0) - (bal.used.Sick || 0)), annual: Math.max(0, (bal.balances.Annual || 0) - (bal.used.Annual || 0)) };
    }
    res.json({ presentToday, hoursThisWeek: 40, leaveBalance, nextPayslip: '30-Sep-2026' });
  } catch (e) { next(e); }
});
app.get('/api/audit', protect, authorize('admin'), async (req, res, next) => {
  try { res.json(await AuditLog.find().sort({ createdAt: -1 }).limit(100)); } catch (e) { next(e); }
});
app.get('/api/analytics', protect, authorize('admin', 'hr'), async (req, res, next) => {
  try {
    const active = await Employee.find({ status: { $ne: 'Resigned' } });
    const byDept = {};
    active.forEach(e => { byDept[e.department] = (byDept[e.department] || 0) + 1; });
    res.json({
      headcount: [{ month: 'Jan', count: 38 }, { month: 'Feb', count: 39 }, { month: 'Mar', count: 40 }, { month: 'Apr', count: 41 }, { month: 'May', count: 42 }, { month: 'Jun', count: active.length }],
      leaveByType: [{ type: 'Casual', count: 45 }, { type: 'Sick', count: 28 }, { type: 'Annual', count: 18 }, { type: 'Maternity', count: 2 }],
      headcountByDept: Object.entries(byDept).map(([name, value]) => ({ name, value })),
    });
  } catch (e) { next(e); }
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use(errorHandler);

app.get("/", (req, res) => {
  res.json({ message: "Backend is working!" });
});


async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`HCM Lite backend on http://localhost:${PORT}`));
  } catch (err) {
    console.error('DB failed:', err.message);
    app.listen(PORT, () => console.log(`Server (DB down) on port ${PORT}`));
  }
}
start();
