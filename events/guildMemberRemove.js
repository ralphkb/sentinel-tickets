const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { ticketsDB, client } = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  getChannel,
  getUser,
  logMessage,
} = require("../utils/mainUtils.js");
const { autoCloseTicket } = require("../utils/ticketAutoClose.js");
const { autoDeleteTicket } = require("../utils/ticketAutoDelete.js");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await member.guild.channels.cache.forEach(async (channel) => {
      const channelID = channel.id;
      if (await ticketsDB.has(channelID)) {
        const { userID, ticketType, creationTime, claimUser } =
          await ticketsDB.get(channelID);
        if (userID && userID === member.id) {
          let ticketChannel = member.guild.channels.cache.get(channelID);
          const channelName = ticketChannel.name;
          let logChannelId = config.logs.userLeft || config.logs.default;
          let logChannel = await getChannel(logChannelId);

          const ticketDeleteButton = new ButtonBuilder()
            .setCustomId("deleteTicket")
            .setLabel(config.deleteButton.label)
            .setEmoji(config.deleteButton.emoji)
            .setStyle(ButtonStyle[config.deleteButton.style]);

          const leftRow = new ActionRowBuilder().addComponents(
            ticketDeleteButton,
          );

          const defaultValues = {
            color: "#2FF200",
            title: "User left the server",
            description: "The user **{user}** left the server.",
            timestamp: true,
            footer: {
              text: `${member.user.tag}`,
              iconURL: `${member.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            },
          };

          const leftEmbed = await configEmbed("userLeftEmbed", defaultValues);
          if (leftEmbed.data && leftEmbed.data.description) {
            leftEmbed.setDescription(
              leftEmbed.data.description.replace(
                /\{user\}/g,
                sanitizeInput(member.user.tag),
              ),
            );
          }
          await ticketChannel.send({
            embeds: [leftEmbed],
            components: [leftRow],
          });
          let onUserLeave = config?.onUserLeave || "close";
          switch (onUserLeave) {
            case "close":
              await autoCloseTicket(channelID, true);
              break;
            case "delete":
              await autoDeleteTicket(channelID);
              break;
            case "none":
              break;
            default:
              await autoCloseTicket(channelID, true);
              break;
          }

          const logDefaultValues = {
            color: "#FF0000",
            title: "Ticket Logs | User Left",
            timestamp: true,
            thumbnail: `${member.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            footer: {
              text: `${member.user.tag}`,
              iconURL: `${member.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            },
          };

          const logUserLeftEmbed = await configEmbed(
            "logUserLeftEmbed",
            logDefaultValues,
          );

          logUserLeftEmbed.addFields([
            {
              name: config.logUserLeftEmbed.field_user || "• Ticket Creator",
              value: `> <@!${member.user.id}>\n> ${sanitizeInput(member.user.tag)}`,
            },
            {
              name: config.logUserLeftEmbed.field_ticket || "• Ticket",
              value: `> #${sanitizeInput(channelName)}\n> ${ticketType}`,
            },
            {
              name: config.logUserLeftEmbed.field_creation || "• Creation Time",
              value: `> <t:${creationTime}:F>`,
            },
            {
              name:
                config.logUserLeftEmbed.field_action || "• Automated Action",
              value: `> ${onUserLeave}`,
            },
          ]);

          let ticketClaimUser;
          if (claimUser) {
            ticketClaimUser = await getUser(claimUser);
          }

          if (ticketClaimUser)
            logUserLeftEmbed.addFields({
              name: config.logUserLeftEmbed.field_claimedBy || "• Claimed By",
              value: `> <@!${ticketClaimUser.id}>\n> ${sanitizeInput(ticketClaimUser.tag)}`,
            });

          if (config.toggleLogs.userLeft) {
            try {
              await logChannel.send({ embeds: [logUserLeftEmbed] });
            } catch (error) {
              error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
              client.emit("error", error);
            }
          }
          await logMessage(
            `${member.user.username} (${member.displayName}) left the server while having the ticket #${channelName} open`,
          );
        }
      }
    });
  },
};
