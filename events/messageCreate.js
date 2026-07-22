const { Events } = require("discord.js");
const { ticketsDB, ticketCategories } = require("../init.js");
const { moveTicketToCategory } = require("../utils/mainUtils.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!config.autoPending?.enabled) return;

    if (!message.guild || message.system) return;

    if (message.author.bot) return;

    if (!(await ticketsDB.has(message.channel.id))) return;

    const ticketData = await ticketsDB.get(message.channel.id);

    const { status, button, userID, pending, lastMessageBy } = ticketData;

    if (status !== "Open") return;

    const category = ticketCategories[button];
    if (!category) return;

    const pendingCategoryIDs =
      config.commands.pending?.pendingCategoryID?.length > 0
        ? config.commands.pending.pendingCategoryID
        : null;
    if (!pendingCategoryIDs) return;

    const member = message.member;
    if (!member) return;

    const isStaff = category.support_role_ids.some((roleId) =>
      member.roles.cache.has(roleId),
    );
    const isTicketCreator = message.author.id === userID;
    const isPending = pending === true;

    if (isStaff) {
      await ticketsDB.set(`${message.channel.id}.lastMessageBy`, "staff");

      if (!isPending && lastMessageBy !== "staff") {
        await moveTicketToCategory(message.channel, pendingCategoryIDs, {
          pending: true,
          lastMessageBy: "staff",
          logTag: `[Auto-Pending] Ticket #${message.channel.name} moved to pending after staff reply by ${message.author.tag}.`,
        });
      }
    } else if (isTicketCreator) {
      await ticketsDB.set(`${message.channel.id}.lastMessageBy`, "user");

      if (isPending && lastMessageBy !== "user") {
        await moveTicketToCategory(message.channel, category.categoryID, {
          pending: false,
          lastMessageBy: "user",
          logTag: `[Auto-Pending] Ticket #${message.channel.name} moved back to active after user reply by ${message.author.tag}.`,
        });
      }
    }
  },
};
