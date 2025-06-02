const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { session } = require('passport');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');


const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/dashboard'); 
    }
    res.render("admin-login", { message: null }); 
};


const pagenotfound=async(req,res)=>{
    res.render('admin-error')
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body; 
   

        if (!email || !password) {
            return res.redirect('/admin/login');
        }

        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.redirect('/admin/login'); 
        }

        const passwordMatch = await bcrypt.compare(password, admin.password); 

        if (passwordMatch) {
            req.session.admin = admin._id;
            console.log("Login successful!");
            return res.redirect('/admin/dashboard');
        } else {
            console.log("Incorrect password.");
            return res.redirect('/admin/admin-login'); 
        }
    } catch (error) {
        console.log("Login error:", error);
        req.session.message = "Page not found";
        return res.redirect('/pagenotfound');
    }
};





const logout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
                console.log("Error while destroying the session:", err);
                return res.redirect('/pagenotfound');
            }
            console.log("Admin session destroyed. Redirecting to /admin/login");
            return res.redirect('/admin/login');  
        });
    } catch (error) {
        console.log("Unexpected error while logout:", error);
        return res.redirect('/pagenotfound');
    }
};

const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, reportType = 'daily', page = 1 } = req.query;
    const currentPage = parseInt(page);
    const limit = 5;
    const skip = (currentPage - 1) * limit;

    const salesData = await getSalesData(startDate, endDate, reportType);
    const { orders, grossSales, couponsRedeemed, discounts, netSales, totalOrders, calculatedStartDate, calculatedEndDate } = salesData;

    const totalPages = Math.ceil(totalOrders / limit);
    const paginatedOrders = orders.slice(skip, skip + limit);

    res.render('sales-report', {
      grossSales,
      couponsRedeemed,
      discounts,
      netSales,
      totalOrders,
      orders: paginatedOrders,
      startDate: reportType === 'custom' ? startDate : calculatedStartDate.toISOString().split('T')[0],
      endDate: reportType === 'custom' ? endDate : calculatedEndDate.toISOString().split('T')[0],
      reportType,
      currentPage,
      totalPages,
    });
  } catch (error) {
    console.error('Error fetching sales report:', error.message, error.stack);
    res.status(500).send('Server Error');
  }
};
const downloadSalesReportPDF = async (req, res) => {
  try {
    const { startDate, endDate, reportType = 'daily' } = req.query;
    const salesData = await getSalesData(startDate, endDate, reportType);
    const { orders, grossSales, couponsRedeemed, discounts, netSales, totalOrders, calculatedStartDate, calculatedEndDate } = salesData;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Sales Report', { align: 'center' });
    doc.moveDown();

    if (reportType === 'custom' && startDate && endDate) {
      doc.fontSize(12).text(`Date Range: ${startDate} to ${endDate}`, { align: 'center' });
    } else {
      doc.fontSize(12).text(
        `Date Range: ${calculatedStartDate.toLocaleDateString('en-US')} to ${calculatedEndDate.toLocaleDateString('en-US')}`,
        { align: 'center' }
      );
    }
    doc.moveDown();

    doc.fontSize(14).text('Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Gross Sales: ₹${grossSales.toLocaleString('en-IN')}`);
    doc.text(`Coupons Redeemed: ₹${couponsRedeemed.toLocaleString('en-IN')}`);
    doc.text(`Discounts: ₹${discounts.toLocaleString('en-IN')}`);
    doc.text(`Net Sales: ₹${netSales.toLocaleString('en-IN')}`);
    doc.text(`Total Orders: ${totalOrders}`);
    doc.moveDown(2);

    doc.fontSize(12).text('Sales Details', { underline: true });
    doc.moveDown(0.5);
    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [80, 80, 80, 80, 80, 80, 80];

    doc.font('Helvetica-Bold');
    const headers = ['Order ID', 'Amount', 'Coupon', 'Final Amount', 'Payment', 'Date', 'Status'];
    headers.forEach((header, i) => {
      doc.text(header, tableLeft + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableTop, {
        width: colWidths[i],
        align: 'center',
      });
    });
    doc.font('Helvetica');
    doc.moveDown(1);

    orders.forEach((order, index) => {
      const y = doc.y;
      doc.text(order.orderId.slice(0, 13), tableLeft, y, { width: colWidths[0], align: 'center' });
      doc.text(`₹${order.amount.toLocaleString('en-IN')}`, tableLeft + colWidths[0], y, { width: colWidths[1], align: 'center' });
      doc.text(`₹${order.coupon.toLocaleString('en-IN')}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'center' });
      doc.text(`₹${order.finalAmount.toLocaleString('en-IN')}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, {
        width: colWidths[3],
        align: 'center',
      });
      doc.text(order.paymentMethod, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, {
        width: colWidths[4],
        align: 'center',
      });
      doc.text(order.date, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y, {
        width: colWidths[5],
        align: 'center',
      });
      doc.text(order.status, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], y, {
        width: colWidths[6],
        align: 'center',
      });
      doc.moveDown(1);
    });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error.message, error.stack);
    res.status(500).send('Error generating PDF');
  }
};




const downloadSalesReportExcel = async (req, res) => {
  try {
    const { startDate, endDate, reportType = 'daily' } = req.query;
    const salesData = await getSalesData(startDate, endDate, reportType);
    const { orders, grossSales, couponsRedeemed, discounts, netSales, totalOrders, calculatedStartDate, calculatedEndDate } = salesData;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    worksheet.addRow(['Sales Report']).getCell(1).font = { size: 16, bold: true };
    worksheet.addRow([]);

    if (reportType === 'custom' && startDate && endDate) {
      worksheet.addRow([`Date Range: ${startDate} to ${endDate}`]);
    } else {
      worksheet.addRow([
        `Date Range: ${calculatedStartDate.toLocaleDateString('en-US')} to ${calculatedEndDate.toLocaleDateString('en-US')}`,
      ]);
    }
    worksheet.addRow([]);

    worksheet.addRow(['Summary']).getCell(1).font = { bold: true };
    worksheet.addRow(['Gross Sales', `₹${grossSales.toLocaleString('en-IN')}`]);
    worksheet.addRow(['Coupons Redeemed', `₹${couponsRedeemed.toLocaleString('en-IN')}`]);
    worksheet.addRow(['Discounts', `₹${discounts.toLocaleString('en-IN')}`]);
    worksheet.addRow(['Net Sales', `₹${netSales.toLocaleString('en-IN')}`]);
    worksheet.addRow(['Total Orders', totalOrders]);
    worksheet.addRow([]);

    worksheet.addRow(['Order ID', 'Amount', 'Coupon', 'Final Amount', 'Payment', 'Date', 'Status']).eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    orders.forEach(order => {
      worksheet.addRow([
        order.orderId.slice(0, 13),
        `₹${order.amount.toLocaleString('en-IN')}`,
        `₹${order.coupon.toLocaleString('en-IN')}`,
        `₹${order.finalAmount.toLocaleString('en-IN')}`,
        order.paymentMethod,
        order.date,
        order.status,
      ]).eachCell(cell => {
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) maxLength = columnLength;
      });
      column.width = maxLength < 10 ? 10 : maxLength;
    });

    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const buffer = await workbook.xlsx.writeBuffer();
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    stream.pipe(res);
  } catch (error) {
    console.error('Error generating Excel:', error.message, error.stack);
    res.status(500).send('Error generating Excel');
  }
};

const getSalesData = async (startDate, endDate, reportType = 'daily') => {
  try {
    let dateFilter = {};
    let calculatedStartDate = '';
    let calculatedEndDate = '';

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    // Validate reportType
    const validReportTypes = ['daily', 'weekly', 'yearly', 'custom'];
    if (!validReportTypes.includes(reportType)) {
      throw new Error('Invalid report type');
    }

    // Set date filters
    if (reportType === 'daily') {
      calculatedStartDate = new Date(now);
      calculatedStartDate.setHours(0, 0, 0, 0);
      calculatedEndDate = new Date(now);
    } else if (reportType === 'weekly') {
      calculatedStartDate = new Date(now);
      calculatedStartDate.setDate(now.getDate() - now.getDay());
      calculatedStartDate.setHours(0, 0, 0, 0);
      calculatedEndDate = new Date(now);
    } else if (reportType === 'yearly') {
      calculatedStartDate = new Date(now.getFullYear(), 0, 1);
      calculatedStartDate.setHours(0, 0, 0, 0);
      calculatedEndDate = new Date(now);
    } else if (reportType === 'custom') {
      if (!startDate || !endDate) {
        throw new Error('Start date and end date are required for custom reports');
      }
      calculatedStartDate = new Date(startDate);
      calculatedEndDate = new Date(endDate);
      calculatedEndDate.setHours(23, 59, 59, 999);
      if (isNaN(calculatedStartDate.getTime()) || isNaN(calculatedEndDate.getTime())) {
        throw new Error('Invalid date format');
      }
      if (calculatedEndDate < calculatedStartDate) {
        throw new Error('End date cannot be earlier than start date');
      }
    } else {
      calculatedStartDate = new Date(now);
      calculatedStartDate.setHours(0, 0, 0, 0);
      calculatedEndDate = new Date(now);
    }

    dateFilter.createdOn = {
      $gte: calculatedStartDate,
      $lte: calculatedEndDate,
    };
    dateFilter.status = { $nin: ['Cancelled', 'Returned'] }; // Exclude cancelled/returned orders

    console.log('Date filter:', dateFilter);

    // Fetch orders, populating user name and email
    const allOrders = await Order.find(dateFilter)
      .populate('user', 'name') // Populate both name and email
      .sort({ createdOn: -1 })
      .lean();

    console.log('Fetched orders:', allOrders.length);

    // Calculate metrics
    const grossSales = allOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
    const couponsRedeemed = allOrders.reduce((sum, order) => sum + (order.couponApplied ? order.discount || 0 : 0), 0);
    const discounts = allOrders.reduce((sum, order) => sum + (order.discount || 0), 0);
    const netSales = grossSales - discounts;
    const totalOrders = allOrders.length;

    // Format orders with user details
    const formattedOrders = allOrders.map(order => ({
      orderId: order.orderId || 'N/A',
      amount: order.totalPrice || 0,
      coupon: order.couponApplied ? order.discount || 0 : 0,
      finalAmount: order.finalAmount || (order.totalPrice || 0) - (order.discount || 0),
      paymentMethod: order.paymentMethod || 'N/A',
      date: order.createdOn
        ? new Date(order.createdOn).toLocaleDateString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : 'N/A',
      status: order.status || 'N/A',
      userName: order.user?.name || 'N/A', // Add user name
      userEmail: order.user?.email || 'N/A', // Add user email
    }));

    return {
      orders: formattedOrders,
      grossSales,
      couponsRedeemed,
      discounts,
      netSales,
      totalOrders,
      calculatedStartDate,
      calculatedEndDate,
    };
  } catch (error) {
    console.error('Error in getSalesData:', error.message, error.stack);
    throw error;
  }
};







module.exports = {
    loadLogin,
    login,
    pagenotfound,
    logout,
    getSalesReport,
    getSalesData ,
    downloadSalesReportExcel,
    downloadSalesReportPDF ,


};
