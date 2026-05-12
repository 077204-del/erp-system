const mongoose = require("mongoose");
require("dotenv").config();

const Sale = require("./models/sale.model");

async function fixSales() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Mongo Connected ✅");

    const sales = await Sale.find();

    for (const sale of sales) {
      const total = Number(sale.total || 0);
      const paid = Number(sale.paidAmount || 0);

      let debt = Math.max(total - paid, 0);

      let status = "DEBT";

      if (debt === 0) {
        status = "PAID";
      } else if (paid > 0) {
        status = "PARTIAL";
      }

      await Sale.updateOne(
        { _id: sale._id },
        {
          $set: {
            debt,
            status,
          },
        }
      );

      console.log("FIXED:", sale._id.toString());
    }

    console.log("ALL SALES FIXED ✅");

    process.exit();

  } catch (err) {
    console.log("FIX ERROR:", err.message);
    process.exit(1);
  }
}

fixSales();