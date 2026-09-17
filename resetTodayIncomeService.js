const cron = require("node-cron");
const User = require("../models/User");

async function resetTodayIncome() {
  await User.updateMany({}, { $set: { todayIncome: 0, todayReferralIncome: 0 } });
  console.log("Today Income Reset Successfully");
}

function startTodayIncomeReset() {
    console.log("[TODAY INCOME] Worker Cron Trigger is configured; local cron is disabled.");
}

module.exports = { startTodayIncomeReset, resetTodayIncome };
