const User = require("../models/User");
const UserProduct = require("../models/UserProduct");
const Income = require("../models/Income");

const TIMEZONE = "Asia/Kolkata";

// Prevent overlapping executions in the same Node.js process
let isProcessing = false;

/*
|--------------------------------------------------------------------------
| Get current IST date parts
|--------------------------------------------------------------------------
*/
function getISTDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);

    const result = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            result[part.type] = part.value;
        }
    }

    return {
        year: Number(result.year),
        month: Number(result.month),
        day: Number(result.day)
    };
}

/*
|--------------------------------------------------------------------------
| Create a Date representing 12:00 AM IST
|--------------------------------------------------------------------------
|
| Server may run in UTC, so we DO NOT use setHours().
|
| 12:00 AM IST = previous day 18:30 UTC.
|
|--------------------------------------------------------------------------
*/
function createISTMidnight(year, month, day) {
    // Temporary UTC date for the requested IST calendar date
    const utcGuess = new Date(
        Date.UTC(year, month - 1, day, 0, 0, 0, 0)
    );

    // Get actual timezone offset for Asia/Kolkata
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        timeZoneName: "longOffset"
    });

    const parts = formatter.formatToParts(utcGuess);

    const offsetPart = parts.find(
        part => part.type === "timeZoneName"
    );

    // India is UTC+05:30.
    // Keep explicit fallback in case Intl format differs.
    let offsetMinutes = 330;

    if (offsetPart?.value) {
        const match = offsetPart.value.match(
            /GMT([+-])(\d{2}):?(\d{2})/
        );

        if (match) {
            const sign = match[1] === "+" ? 1 : -1;
            offsetMinutes =
                sign *
                (
                    Number(match[2]) * 60 +
                    Number(match[3])
                );
        }
    }

    return new Date(
        utcGuess.getTime() - offsetMinutes * 60 * 1000
    );
}

/*
|--------------------------------------------------------------------------
| Get next 12:00 AM IST
|--------------------------------------------------------------------------
*/
function getNextMidnight(date = new Date()) {
    const { year, month, day } = getISTDateParts(date);

    let midnight = createISTMidnight(year, month, day);

    // If today's midnight has already passed,
    // move to tomorrow's midnight.
    if (midnight <= date) {
        const tomorrow = new Date(
            Date.UTC(year, month - 1, day)
        );

        tomorrow.setUTCDate(
            tomorrow.getUTCDate() + 1
        );

        midnight = createISTMidnight(
            tomorrow.getUTCFullYear(),
            tomorrow.getUTCMonth() + 1,
            tomorrow.getUTCDate()
        );
    }

    return midnight;
}

/*
|--------------------------------------------------------------------------
| Check whether a Date is exactly 12:00 AM IST
|--------------------------------------------------------------------------
*/
function isISTMidnight(date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return (
        Number(values.hour) === 0 &&
        Number(values.minute) === 0 &&
        Number(values.second) === 0
    );
}

/*
|--------------------------------------------------------------------------
| Credit Product Income
|--------------------------------------------------------------------------
|
| Every product receives EXACTLY its own dailyIncome.
|
| Examples:
|
| ₹520    -> ₹130/day
| ₹1200   -> ₹310/day
| ₹3500   -> ₹920/day
| ₹7000   -> ₹1890/day
| ₹15000  -> ₹4200/day
|
|--------------------------------------------------------------------------
*/
async function creditProductIncome() {
    if (isProcessing) {
        console.log(
            "[PRODUCT INCOME] Previous cycle still running. Skipping."
        );

        return;
    }

    isProcessing = true;

    try {
        const now = new Date();

        const products = await UserProduct.find({
            status: "Running"
        });

        console.log(
            `[PRODUCT INCOME] Checking ${products.length} running products`
        );

        for (const item of products) {
            try {
                const earnedDays = Number(
                    item.earnedDays || 0
                );

                const totalDays = Number(
                    item.totalDays || 0
                );

                const incomeAmount = Number(
                    item.dailyIncome || 0
                );

                /*
                |--------------------------------------------------------------------------
                | Invalid total days
                |--------------------------------------------------------------------------
                */
                if (totalDays <= 0) {
                    item.status = "Completed";
                    item.nextIncomeAt = null;

                    await item.save();

                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | Already completed
                |--------------------------------------------------------------------------
                */
                if (earnedDays >= totalDays) {
                    item.status = "Completed";
                    item.nextIncomeAt = null;

                    await item.save();

                    console.log(
                        "[PRODUCT INCOME] Product completed:",
                        item._id.toString()
                    );

                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | Validate daily income
                |--------------------------------------------------------------------------
                */
                if (
                    !Number.isFinite(incomeAmount) ||
                    incomeAmount <= 0
                ) {
                    console.warn(
                        "[PRODUCT INCOME] Invalid daily income:",
                        {
                            productId: item._id.toString(),
                            productName: item.productName,
                            amount: item.amount,
                            dailyIncome: item.dailyIncome
                        }
                    );

                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | Set first income time
                |--------------------------------------------------------------------------
                |
                | New product:
                | next income = next 12:00 AM IST
                |
                |--------------------------------------------------------------------------
                */
                if (!item.nextIncomeAt) {
                    item.nextIncomeAt = getNextMidnight(
                        item.purchaseDate || now
                    );

                    await item.save();

                    console.log(
                        "[PRODUCT INCOME] nextIncomeAt set:",
                        {
                            productId: item._id.toString(),
                            nextIncomeAt: item.nextIncomeAt
                        }
                    );

                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | Repair old noon schedule
                |--------------------------------------------------------------------------
                |
                | Older records may have nextIncomeAt based on the previous
                | 12 PM logic. Convert them to the next midnight IST.
                |
                |--------------------------------------------------------------------------
                */
                if (!isISTMidnight(item.nextIncomeAt)) {
                    const repairedTime = getNextMidnight(
                        item.nextIncomeAt
                    );

                    item.nextIncomeAt = repairedTime;

                    await item.save();

                    console.log(
                        "[PRODUCT INCOME] Old schedule repaired to 12:00 AM IST:",
                        {
                            productId: item._id.toString(),
                            nextIncomeAt: repairedTime
                        }
                    );

                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | Not yet due
                |--------------------------------------------------------------------------
                */
                if (now < item.nextIncomeAt) {
                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | Find user
                |--------------------------------------------------------------------------
                */
                const user = await User.findById(
                    item.user
                );

                if (!user) {
                    console.warn(
                        "[PRODUCT INCOME] User not found:",
                        {
                            productId: item._id.toString(),
                            userId: String(item.user)
                        }
                    );

                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | CREDIT EXACT DAILY AMOUNT
                |--------------------------------------------------------------------------
                */
                const newEarnedDays =
                    earnedDays + 1;

                const newTotalEarned =
                    Number(item.totalEarned || 0) +
                    incomeAmount;

                item.earnedDays =
                    newEarnedDays;

                item.totalEarned =
                    newTotalEarned;

                item.lastIncomeAt =
                    now;

                /*
                |--------------------------------------------------------------------------
                | Schedule next day
                |--------------------------------------------------------------------------
                */
                if (newEarnedDays >= totalDays) {
                    item.status = "Completed";
                    item.nextIncomeAt = null;
                } else {
                    item.nextIncomeAt =
                        getNextMidnight(
                            new Date(
                                now.getTime() +
                                24 * 60 * 60 * 1000
                            )
                        );
                }

                await item.save();

                /*
                |--------------------------------------------------------------------------
                | USER BALANCE
                |--------------------------------------------------------------------------
                */
                user.balance =
                    Number(user.balance || 0) +
                    incomeAmount;

                user.totalIncome =
                    Number(user.totalIncome || 0) +
                    incomeAmount;

                user.productIncome =
                    Number(user.productIncome || 0) +
                    incomeAmount;

                await user.save();

                /*
                |--------------------------------------------------------------------------
                | INCOME HISTORY
                |--------------------------------------------------------------------------
                */
                await Income.create({
                    user: user._id,
                    product: item.product,
                    amount: incomeAmount,
                    type: "Product Income",
                    remark:
                        `Daily Product Income - Day ${newEarnedDays}`
                });

                /*
                |--------------------------------------------------------------------------
                | SUCCESS LOG
                |--------------------------------------------------------------------------
                */
                console.log(
                    "[PRODUCT INCOME] CREDITED SUCCESSFULLY:",
                    {
                        user: user._id.toString(),
                        userProduct: item._id.toString(),
                        productName: item.productName,
                        productAmount: item.amount,
                        dailyIncome: incomeAmount,
                        day: newEarnedDays,
                        totalDays: totalDays,
                        totalEarned: newTotalEarned,
                        nextIncomeAt: item.nextIncomeAt
                    }
                );

            } catch (itemError) {
                console.error(
                    "[PRODUCT INCOME] Item processing error:",
                    item._id?.toString(),
                    itemError
                );
            }
        }

    } catch (error) {
        console.error(
            "[PRODUCT INCOME] Service error:",
            error
        );
    } finally {
        isProcessing = false;
    }
}

/*
|--------------------------------------------------------------------------
| START AUTOMATIC PRODUCT INCOME SERVICE
|--------------------------------------------------------------------------
|
| Cron runs every minute.
|
| It checks whether nextIncomeAt <= current time.
|
| Actual earning time:
| 12:00 AM IST
|
|--------------------------------------------------------------------------
*/
function startProductIncomeService() {
    console.log("[PRODUCT INCOME] Worker Cron Trigger is configured; local cron is disabled.");
}

module.exports = {
    creditProductIncome,
    startProductIncomeService,
    getNextMidnight
};