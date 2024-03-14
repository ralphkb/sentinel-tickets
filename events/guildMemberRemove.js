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
const { ticketsDB, sanitizeInput, configEmbed } = require("../index.js");

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
              iconURL: `${member.user.displayAvatarURL({ extension: "png", dynamic: true, size: 1024 })}`,
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
          ticketChannel.send({ embeds: [leftEmbed], components: [leftRow] });
        }
      }
    });
  },
};
