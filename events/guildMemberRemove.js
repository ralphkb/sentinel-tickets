const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB } = require("../init.js");
const { configEmbed, sanitizeInput } = require("../utils/mainUtils.js");
const { autoCloseTicket } = require("../utils/ticketAutoClose.js");
const { autoDeleteTicket } = require("../utils/ticketAutoDelete.js");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await member.guild.channels.cache.forEach(async (channel) => {
      if (await ticketsDB.has(channel.id)) {
        const { userID } = await ticketsDB.get(channel.id);
        if (userID && userID === member.id) {
          let ticketChannel = member.guild.channels.cache.get(channel.id);

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
              await autoCloseTicket(channel.id, true);
              break;
            case "delete":
              await autoDeleteTicket(channel.id);
              break;
            case "none":
              break;
            default:
              await autoCloseTicket(channel.id, true);
              break;
          }
        }
      }
    });
  },
};
