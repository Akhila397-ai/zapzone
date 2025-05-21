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



const loadDashboard=async(req,res)=>{
    if(req.session.admin){
        try {
            res.render('dashboard')
        } catch (error) {
            res.redirect('/pagenotfound')
            
        }
    }
}

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
    const { startDate, endDate, page = 1 } = req.query;
    const currentPage = parseInt(page);
    const limit = 5;
    const skip = (currentPage - 1) * limit;

    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).send('Invalid date format');
      }
      end.setHours(23, 59, 59, 999);
      if (end < start) {
        return res.status(400).send('End date cannot be earlier than start date');
      }
      dateFilter.createdOn = {
        $gte: start,
        $lte: end,
      };
    }

    const totalOrdersCount = await Order.countDocuments(dateFilter);
    const totalPages = Math.ceil(totalOrdersCount / limit);

    const orders = await Order.find(dateFilter)
      .populate('user', 'name')
      .sort({ createdOn: -1 }) 
      .skip(skip)
      .limit(limit);

    const allOrders = await Order.find(dateFilter);
    const grossSales = allOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
    const couponsRedeemed = allOrders.reduce((sum, order) => sum + (order.couponApplied ? order.discount : 0), 0);
    const discounts = allOrders.reduce((sum, order) => sum + (order.discount || 0), 0);
    const netSales = grossSales - discounts;
    const totalOrders = totalOrdersCount;

    const formattedOrders = orders.map(order => ({
      orderId: order.orderId || 'N/A',
      amount: order.totalPrice || 0,
      coupon: order.couponApplied ? order.discount : 0,
      finalAmount: order.finalAmount || (order.totalPrice || 0) - (order.discount || 0),
      paymentMethod: order.paymentMethod || 'N/A',
      date: order.createdOn ? order.createdOn.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) : 'N/A',
      status: order.status || 'N/A',
    }));

    res.render('sales-report', {
      grossSales,
      couponsRedeemed,
      discounts,
      netSales,
      totalOrders,
      orders: formattedOrders,
      startDate: startDate || '',
      endDate: endDate || '',
      currentPage,
      totalPages,
    });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).send('Server Error');
  }
};
const downloadSalesReportPDF = async (req, res) => {
  try {
   
    const salesData = await getSalesData(req.query.startDate, req.query.endDate);

    const { orders, grossSales, couponsRedeemed, discounts, netSales, totalOrders } = salesData;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    
    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);

    doc.fontSize(20).text('Sales Report', { align: 'center' });
    doc.moveDown();

    if (req.query.startDate && req.query.endDate) {
      doc.fontSize(12).text(`Date Range: ${req.query.startDate} to ${req.query.endDate}`, { align: 'center' });
      doc.moveDown();
    }

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
        align: 'center'
      });
    });
    doc.font('Helvetica');
    doc.moveDown(1);

    orders.forEach((order, index) => {
      const y = doc.y;
      doc.text(order.orderId.slice(0, 13), tableLeft, y, { width: colWidths[0], align: 'center' });
      doc.text(`₹${order.amount.toLocaleString('en-IN')}`, tableLeft + colWidths[0], y, { width: colWidths[1], align: 'center' });
      doc.text(`₹${order.coupon.toLocaleString('en-IN')}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'center' });
      doc.text(`₹${order.finalAmount.toLocaleString('en-IN')}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'center' });
      doc.text(order.paymentMethod, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, { width: colWidths[4], align: 'center' });
      doc.text(order.date, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y, { width: colWidths[5], align: 'center' });
      doc.text(order.status, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], y, { width: colWidths[6], align: 'center' });
      doc.moveDown(1);
    });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF');
  }
};




const downloadSalesReportExcel = async (req, res) => {
  try {
    const salesData = await getSalesData(req.query.startDate, req.query.endDate);
    const { orders, grossSales, couponsRedeemed, discounts, netSales, totalOrders } = salesData;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    worksheet.addRow(['Sales Report']).getCell(1).font = { size: 16, bold: true };
    worksheet.addRow([]);

    if (req.query.startDate && req.query.endDate) {
      worksheet.addRow([`Date Range: ${req.query.startDate} to ${req.query.endDate}`]);
      worksheet.addRow([]);
    }

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
        order.status
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

async function getSalesData(startDate, endDate) {
  return {
    orders: [
      { orderId: 'ORD1234567890', amount: 5000, coupon: 500, finalAmount: 4500, paymentMethod: 'Credit Card', date: '2025-05-17', status: 'Delivered' },
    ],
    grossSales: 5000,
    couponsRedeemed: 500,
    discounts: 500,
    netSales: 4500,
    totalOrders: 1
  };
}







module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pagenotfound,
    logout,
    getSalesReport,
    getSalesReport ,
    downloadSalesReportExcel,
    downloadSalesReportPDF ,


};
