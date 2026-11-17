const cron = require("node-cron");
const Account = require("../models/Account");
const Application = require("../models/Application");
const Notification = require("../models/Notification");
const { sendMemberNotificationEmail } = require("../services/mailer");
const oneSignalService = require("../services/oneSignalService");

const dateInManila = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

async function createBookingReminderNotifications() {
  const today = dateInManila(new Date());
  const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = dateInManila(tomorrowDate);
  const dayAfterDate = new Date(tomorrowDate);
  dayAfterDate.setUTCDate(dayAfterDate.getUTCDate() + 1);
  const dayAfterTomorrow = dateInManila(dayAfterDate);

  const applications = await Application.find({
    status: "Approved",
    startDate: { $gte: tomorrow, $lt: dayAfterTomorrow },
  }).select("_id memberEmail equipment startDate endDate").lean();
  if (applications.length === 0) return 0;

  const members = await Account.find({ email: { $in: applications.map((app) => app.memberEmail) } })
    .select("email fullName memberSettings")
    .lean();
  const memberByEmail = new Map(members.map((member) => [member.email, member]));
  const baseOrigin = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

  let created = 0;
  for (const application of applications) {
    const member = memberByEmail.get(application.memberEmail);
    const settings = member?.memberSettings?.notifications;
    if (settings?.bookingReminders === false) continue;

    let shouldNotifyChannels = false;
    if (settings?.inApp !== false) {
      const result = await Notification.updateOne(
        { dedupeKey: `booking-reminder:${application._id}` },
        {
          $setOnInsert: {
            memberEmail: application.memberEmail,
            title: "Rental reminder",
            message: `Your ${application.equipment} rental starts tomorrow.`,
            type: "reminder",
            relatedApplicationId: application._id,
            dedupeKey: `booking-reminder:${application._id}`,
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount) {
        created++;
        shouldNotifyChannels = true;
      }
    } else {
      shouldNotifyChannels = true;
    }

    if (shouldNotifyChannels) {
      const reminderTitle = "Rental Reminder";
      const reminderMessage = `Your ${application.equipment} rental starts tomorrow (${application.startDate}).`;
      if (settings?.push !== false) {
        oneSignalService.sendPushNotification({
          email: application.memberEmail,
          title: reminderTitle,
          message: reminderMessage,
          url: `${baseOrigin}/member/bookings`,
        }).catch(() => {});
      }
      if (settings?.email !== false) {
        sendMemberNotificationEmail({
          toEmail: application.memberEmail,
          fullName: member?.fullName || "Member",
          title: reminderTitle,
          message: reminderMessage,
          actionUrl: `${baseOrigin}/member/bookings`,
          category: "Rental Reminder",
        }).catch(() => {});
      }
    }
  }
  return created;
}

function startBookingReminderWorker() {
  cron.schedule("0 8 * * *", () => {
    createBookingReminderNotifications().catch((error) => {
      console.error("[BookingReminder] Failed to create booking reminders:", error);
    });
  }, { timezone: "Asia/Manila" });
  console.log('[BookingReminder] Daily reminder worker scheduled → "0 8 * * *" (Asia/Manila)');
}

module.exports = { createBookingReminderNotifications, startBookingReminderWorker };
