/** @deprecated Use financialEngine.service.js */
const engine = require("./financialEngine.service");

module.exports = {
  toNumber: engine.toNumber,
  computeMarginFromSales: async () => {
    throw new Error("Use financialEngine.computeCore instead");
  },
};
