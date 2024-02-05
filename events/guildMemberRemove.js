const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { ticketsDB, sanitizeInput } = require('../index.js');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await member.guild.channels.cache.forEach(async (channel) => {
      if (await ticketsDB.has(channel.id)) {
        const { userID } = await ticketsDB.get(channel.id);
        if (userID && userID === member.id) {
          let ticketChannel = member.guild.channels.cache.get(channel.id);

          const ticketDeleteButton = new ButtonBuilder()
            .setCustomId('deleteTicket')
            .setLabel(config.deleteButton.label)
            .setEmoji(config.deleteButton.emoji)
            .setStyle(ButtonStyle[config.deleteButton.style]);

          const leftRow = new ActionRowBuilder().addComponents(
            ticketDeleteButton,
          );

          const leftEmbed = new EmbedBuilder()
            .setColor(config.userLeftEmbed.embed_color)
            .setTitle(config.userLeftEmbed.embed_title)
            .setDescription(
              `${config.userLeftEmbed.embed_description}`.replace(
                /\{user\}/g,
                sanitizeInput(member.user.tag),
              ),
            )
            .setFooter({
              text: `${member.user.tag}`,
              iconURL: `${member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}`,
            })
            .setTimestamp();
          ticketChannel.send({ embeds: [leftEmbed], components: [leftRow] });
        }
      }
    });
  },
};
