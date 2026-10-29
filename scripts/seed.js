require('dotenv').config();
const mongoose = require('mongoose');
const { User, Employee, LeaveRequest, LeaveBalance, Attendance, AttendanceCorrection, Announcement, Notification, Payroll, Organization, AuditLog } = require('../models');

const departments = [
  { name: 'Engineering', head: 'Hamza Siddiqui', active: true },
  { name: 'Human Resources', head: 'Bilal Ahmed', active: true },
  { name: 'Finance', head: 'Sana Qureshi', active: true },
  { name: 'Sales', head: 'Usman Malik', active: true },
  { name: 'Marketing', head: 'Noor Sheikh', active: true },
  { name: 'Operations', head: 'Imran Hussain', active: true },
  { name: 'Support', head: 'Rabia Khan', active: true },
];
const designations = [
  { name: 'Software Engineer', department: 'Engineering', active: true },
  { name: 'Engineering Manager', department: 'Engineering', active: true },
  { name: 'HR Executive', department: 'Human Resources', active: true },
  { name: 'HR Manager', department: 'Human Resources', active: true },
  { name: 'Accountant', department: 'Finance', active: true },
  { name: 'Finance Manager', department: 'Finance', active: true },
  { name: 'Sales Executive', department: 'Sales', active: true },
  { name: 'Sales Lead', department: 'Sales', active: true },
  { name: 'Content Strategist', department: 'Marketing', active: true },
  { name: 'Marketing Manager', department: 'Marketing', active: true },
  { name: 'Operations Analyst', department: 'Operations', active: true },
  { name: 'Operations Lead', department: 'Operations', active: true },
  { name: 'Support Agent', department: 'Support', active: true },
  { name: 'Support Lead', department: 'Support', active: true },
];
const people = [['Ayesha','F'],['Bilal','M'],['Sara','F'],['Hamza','M'],['Fatima','F'],['Usman','M'],['Zainab','F'],['Ali','M'],['Maryam','F'],['Omar','M'],['Hina','F'],['Daniyal','M'],['Noor','F'],['Imran','M'],['Sana','F'],['Talha','M'],['Iqra','F'],['Faisal','M'],['Rabia','F'],['Kamran','M'],['Mehwish','F'],['Asad','M'],['Laiba','F'],['Junaid','M']];
const surnames = ['Raza','Ahmed','Khan','Siddiqui','Malik','Sheikh','Qureshi','Hussain'];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Clearing...');
  await Promise.all([User,Employee,LeaveRequest,LeaveBalance,Attendance,AttendanceCorrection,Announcement,Notification,Payroll,Organization,AuditLog].map(M => M.deleteMany({})));

  await Organization.create({
    name: 'Northwind Technologies', departments, designations,
    leaveTypes: [
      { name: 'Annual', quota: 20, paid: 'Paid', active: true },
      { name: 'Sick', quota: 10, paid: 'Paid', active: true },
      { name: 'Casual', quota: 8, paid: 'Paid', active: true },
      { name: 'Unpaid', quota: 0, paid: 'Unpaid', active: true },
    ],
    holidays: [
      { name: 'Eid Milad-un-Nabi', date: new Date('2026-08-26') },
      { name: 'Iqbal Day', date: new Date('2026-11-09') },
      { name: "Quaid-e-Azam's Birthday", date: new Date('2026-12-25') },
      { name: 'Kashmir Solidarity Day', date: new Date('2027-02-05') },
    ],
  });

  const empData = Array.from({ length: 48 }, (_, i) => {
    const [first, gender] = people[i % people.length];
    const department = departments[i % departments.length].name;
    const options = designations.filter(d => d.department === department);
    const joined = new Date(Date.UTC(2019 + (i % 7), (i * 5) % 12, 1 + ((i * 3) % 27)));
    return {
      code: `EMP-${1001 + i}`,
      name: `${first} ${surnames[(i * 3 + 1) % surnames.length]}`,
      email: `${first.toLowerCase()}.${1001 + i}@northwind.test`,
      phone: `+92 300 ${String(1000000 + i * 7919).slice(0, 7)}`,
      address: `House ${10 + i}, Block ${(i % 9) + 1}, Karachi`,
      department, designation: options[i % options.length].name,
      status: i % 11 === 10 ? 'Resigned' : i % 7 === 3 ? 'On probation' : 'Active',
      joiningDate: joined, salary: 90000 + ((i * 7919) % 12) * 15000,
      gender: gender === 'F' ? 'Female' : 'Male',
      employmentType: i % 9 === 0 ? 'Contract' : 'Full-time',
      manager: departments[i % departments.length].head,
    };
  });
  const employees = await Employee.insertMany(empData);
  const empByCode = {};
  employees.forEach(e => { empByCode[e.code] = e; });

  const password = 'password123';
  const adminUser = await User.create({ email: 'admin@hcm.test', password, name: 'Ayesha Raza', role: 'admin' });
  const hrEmp = empByCode['EMP-1002'];
  const hrUser = await User.create({ email: 'hr@hcm.test', password, name: hrEmp.name, role: 'hr', employeeId: hrEmp._id });
  await Employee.findByIdAndUpdate(hrEmp._id, { userId: hrUser._id });
  const empEmp = empByCode['EMP-1005'];
  const empUser = await User.create({ email: 'employee@hcm.test', password, name: empEmp.name, role: 'employee', employeeId: empEmp._id });
  await Employee.findByIdAndUpdate(empEmp._id, { userId: empUser._id });

  for (const e of employees) {
    if (e.status === 'Resigned') continue;
    await LeaveBalance.create({
      employee: e._id, employeeCode: e.code,
      balances: { Annual: 20, Sick: 10, Casual: 8, Unpaid: 0, Maternity: 0, Paternity: 0 },
      used: { Annual: Math.floor(Math.random()*5), Sick: Math.floor(Math.random()*3), Casual: Math.floor(Math.random()*4), Unpaid: 0, Maternity: 0, Paternity: 0 },
    });
  }

  const activeEmps = employees.filter(e => e.status !== 'Resigned');
  const leaveTypes = ['Annual', 'Sick', 'Casual'];
  const statuses = ['pending', 'approved', 'rejected'];
  for (let i = 0; i < 18; i++) {
    const e = activeEmps[i % activeEmps.length];
    const start = new Date(); start.setDate(start.getDate() + (i % 20) - 5);
    const days = 1 + (i % 4);
    const end = new Date(start); end.setDate(end.getDate() + days - 1);
    await LeaveRequest.create({
      employee: e._id, employeeCode: e.code, employeeName: e.name,
      type: leaveTypes[i % 3], startDate: start, endDate: end, days,
      reason: ['Family event', 'Medical appointment', 'Personal work', 'Travel'][i % 4],
      status: statuses[i % 3],
      reviewedBy: statuses[i % 3] !== 'pending' ? 'Bilal Ahmed' : null,
      reviewedAt: statuses[i % 3] !== 'pending' ? new Date() : null,
    });
  }

  const today = new Date(); today.setHours(0,0,0,0);
  for (let d = 0; d < 14; d++) {
    const date = new Date(today); date.setDate(date.getDate() - d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    for (const e of activeEmps.slice(0, 40)) {
      const rand = Math.random();
      let status = 'Present', checkIn = '09:0' + Math.floor(Math.random()*5), checkOut = '18:' + String(10+Math.floor(Math.random()*40)).padStart(2,'0');
      if (rand < 0.08) { status = 'Absent'; checkIn = null; checkOut = null; }
      else if (rand < 0.18) { status = 'Late'; checkIn = '09:' + String(20+Math.floor(Math.random()*30)).padStart(2,'0'); }
      else if (rand < 0.25) { status = 'On leave'; checkIn = null; checkOut = null; }
      await Attendance.create({ employee: e._id, employeeCode: e.code, employeeName: e.name, date, checkIn, checkOut, status, workHours: (status==='Present'||status==='Late')?8:0 });
    }
  }

  for (let i = 0; i < 5; i++) {
    const e = activeEmps[i+5];
    const date = new Date(today); date.setDate(date.getDate()-(i+1));
    await AttendanceCorrection.create({
      employee: e._id, employeeCode: e.code, employeeName: e.name, date,
      requestedCheckIn: '09:05', requestedCheckOut: '18:00', reason: 'Forgot to check in',
      status: i < 2 ? 'pending' : i < 4 ? 'approved' : 'rejected',
      reviewedBy: i >= 2 ? 'Bilal Ahmed' : null, reviewedAt: i >= 2 ? new Date() : null,
    });
  }

  await Announcement.insertMany([
    { title: 'Q4 Town Hall', body: 'Join us for the quarterly town hall on 5 November.', author: 'Ayesha Raza', audience: 'all', pinned: true },
    { title: 'Updated Leave Policy', body: 'Casual leave quota increased to 8 days.', author: 'Bilal Ahmed', audience: 'all' },
    { title: 'Payroll Cut-off Reminder', body: 'Submit attendance corrections before the 25th.', author: 'Sana Qureshi', audience: 'all' },
  ]);

  await Notification.insertMany([
    { user: empUser._id, title: 'Leave approved', message: 'Your Casual leave request has been approved.', type: 'leave', read: false },
    { user: empUser._id, title: 'Payslip ready', message: 'Your September 2026 payslip is available.', type: 'payroll', read: true },
    { user: hrUser._id, title: 'Pending leave requests', message: 'There are 6 leave requests awaiting review.', type: 'warning', read: false },
    { user: adminUser._id, title: 'System notice', message: 'Database seeded with fresh data.', type: 'info', read: false },
  ]);

  for (const month of ['2026-08', '2026-09', '2026-10']) {
    const payslips = activeEmps.slice(0, 44).map(e => {
      const basic = e.salary, allowances = Math.round(basic*0.15), deductions = Math.round(basic*0.05), tax = Math.round(basic*0.08);
      return { employee: e._id, employeeCode: e.code, employeeName: e.name, department: e.department, basic, allowances, deductions, tax, net: basic+allowances-deductions-tax, status: month==='2026-10'?'draft':'paid' };
    });
    await Payroll.create({
      month, status: month==='2026-10'?'draft':'finalized',
      totalGross: payslips.reduce((s,p)=>s+p.basic+p.allowances,0),
      totalNet: payslips.reduce((s,p)=>s+p.net,0),
      employeeCount: payslips.length, payslips,
      finalizedAt: month==='2026-10'?null:new Date(), finalizedBy: month==='2026-10'?null:'Ayesha Raza',
    });
  }

  await AuditLog.create({ actor: 'System', action: 'SEED', entity: 'Database', details: { message: 'Fresh seed' } });
  console.log('✅ Seed done. Logins: admin@hcm.test / hr@hcm.test / employee@hcm.test  password: password123');
  await mongoose.disconnect();
}
seed().catch(e => { console.error(e); process.exit(1); });
