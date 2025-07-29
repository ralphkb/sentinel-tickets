const { Events } = require("discord.js");




const { ticketCategories, ticketsDB } = require("../init.js");
const {
  getChannel,
  getPermissionOverwrites,
  logMessage,
} = require("../utils/mainUtils.js");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (config.addUsersBack) {
      const user = member.user;
      const tickets = (await ticketsDB.all()) || [];
      const userTickets = tickets.filter(
        (ticket) => ticket.value.userID === user.id,
      );
      if (userTickets.length > 0) {
        for (const ticket of userTickets) {
          const channel = await getChannel(ticket.id);
          const foundId = ticket.value.button;
          const category = ticketCategories[foundId];
          const creatorPerms = category?.permissions?.ticketCreator;
          if (ticket.value.status === "Open") {
            const creatorOpenPerms = await getPermissionOverwrites(
              creatorPerms,
              "open",
              {
                allow: [
                  "ViewChannel",
                  "SendMessages",
                  "EmbedLinks",
                  "AttachFiles",
                  "ReadMessageHistory",
                ],
                deny: [],
              },
            );
            await channel.permissionOverwrites.create(user, creatorOpenPerms);
            await logMessage(
              `${user.tag} was added back to the following open ticket: ${channel.name}.`,
            );
          } else if (ticket.value.status === "Closed") {
            const creatorClosePerms = await getPermissionOverwrites(
              creatorPerms,
              "close",
              {
                allow: [],
                deny: ["SendMessages"],
              },
            );
            creatorClosePerms["ViewChannel"] = true;
            creatorClosePerms["ReadMessageHistory"] = true;
            await channel.permissionOverwrites.create(user, creatorClosePerms);
            await logMessage(
              `${user.tag} was added back to the following closed ticket: ${channel.name}.`,
            );
          }
        }
      }
    }
  },
};
